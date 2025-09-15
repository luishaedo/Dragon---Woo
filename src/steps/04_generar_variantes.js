// src/steps/04_generar_variantes.js
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { readTable } from "../utils/readTable.js";
import { writeCsv } from "../utils/csv.js";
import { tallesFromCurva, tokenForTalle } from "../utils/curvas.js";
import { loadColorsMap } from "../utils/colors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const LOGS_DIR = path.resolve(REPO_ROOT, "logs");
const OUT_DIR  = path.resolve(REPO_ROOT, "out");
const OUT_SPLIT_DIR = path.join(OUT_DIR, "variantes_por_padre");

const HEADERS = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, "config/headers_woo.json"), "utf-8"));

function blankRow() {
  const row = Object.fromEntries(HEADERS.map(h => [h, ""]));
  row["ID"] = "";
  row["Tipo"] = "variation";
  row["Publicado"] = "1";
  row["Visibilidad en el catálogo"] = "visible";
  row["¿Permitir reseñas de clientes?"] = "0";
  row["Saldo de inventario"] = "9999";
  row["¿Habilitar gestión de inventario en el producto?"] = "1";
  row["¿Vendido individualmente?"] = "0";
  return row;
}

function buildRow({ idPadre, skuVar, nombreVar, colorName, talle }) {
  const row = blankRow();
  row["SKU"] = skuVar;
  row["Nombre"] = nombreVar;
  row["ID padre"] = String(idPadre || "");

  // Atributo 1 = Color (si hay color), Atributo 2 = Talle; si no hay color, Atrib 1 = Talle
  if (colorName) {
    row["Nombre del atributo 1"] = "Color";
    row["Valor(es) del atributo 1"] = colorName;
    row["Atributo visible 1"] = "1";
    row["Atributo global 1"] = "0";

    row["Nombre del atributo 2"] = "Talle";
    row["Valor(es) del atributo 2"] = talle;
    row["Atributo visible 2"] = "1";
    row["Atributo global 2"] = "0";
  } else {
    row["Nombre del atributo 1"] = "Talle";
    row["Valor(es) del atributo 1"] = talle;
    row["Atributo visible 1"] = "1";
    row["Atributo global 1"] = "0";
  }
  return row;
}

function uniq(arr) { return Array.from(new Set(arr)); }

// --- Maestro helpers ---
const CODIGO_KEYS = ["sku","SKU","codigo","Código","Codigo","Codigo artículo","Codigo articulo","Código artículo"];
const CURVA_KEYS  = ["curva_talles","Curva de talles","curva","Curva","Curva talles","Talle curva","Talles curva"];

async function loadMaestroRows() {
  const mdir = path.resolve(REPO_ROOT, "data/maestro");
  if (!(await fs.pathExists(mdir))) return [];
  const files = (await fs.readdir(mdir)).filter(f => /\.(csv|xlsx|xls)$/i.test(f));
  if (!files.length) return [];
  // usa el archivo más reciente por fecha de modificación
  files.sort((a,b)=> {
    const sa = fs.statSync(path.join(mdir,a)).mtimeMs;
    const sb = fs.statSync(path.join(mdir,b)).mtimeMs;
    return sb - sa;
  });
  const rows = await readTable(path.join(mdir, files[0]));
  return rows;
}

function getField(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

// Devuelve la curva (texto o código) para un sku_base buscándolo en maestro:
// - Priorizamos filas cuyo SKU comience por sku_base y sea más largo (base+color).
function curvaForBase(maestroRows, skuBase) {
  const base = String(skuBase || "").trim().toUpperCase();
  if (!base) return "";

  let candidate = null;
  for (const r of maestroRows) {
    const skuRaw = String(getField(r, CODIGO_KEYS) || "").trim().toUpperCase();
    if (!skuRaw) continue;
    if (skuRaw === base) {
      candidate = r; // exact match
      break;
    }
    if (skuRaw.startsWith(base) && skuRaw.length > base.length) {
      // prefer first colorized match
      candidate = candidate || r;
    }
  }
  if (!candidate) return "";
  const curva = String(getField(candidate, CURVA_KEYS) || "").trim();
  return curva;
}

async function main() {
  // Args:
  //   node 04_generar_variantes.js data/export_woo_padres.csv out/woo_variantes.csv out/dragonfish_activar.txt
  const exportWooPath = process.argv[2] || "data/export_woo_padres.csv";
  const outCsv        = process.argv[3] || "out/woo_variantes.csv";
  const outTxt        = process.argv[4] || "out/dragonfish_activar.txt";

  await fs.ensureDir(path.dirname(outCsv));
  await fs.ensureDir(path.dirname(outTxt));
  await fs.ensureDir(LOGS_DIR);
  await fs.ensureDir(OUT_SPLIT_DIR);

  // 1) Export de Woo → Mapa SKU->(ID, Nombre) de padres
  const exportWoo = await readTable(path.resolve(REPO_ROOT, exportWooPath));
  const skuTo = new Map();
  for (const r of exportWoo) {
    const tipo = String(r.Tipo || r.type || "").toLowerCase();
    const attrs = [r["Nombre del atributo 1"], r["Nombre del atributo 2"]].map(x => String(x||"").toLowerCase());
    const tieneTalle = attrs.includes("talle");
    if (tipo === "variable" || tieneTalle) {
      const sku = String(r.SKU || r.sku || "").trim().toUpperCase();
      const id  = String(r.ID || r.id || "").trim();
      const nombre = String(r.Nombre || r.name || "").trim();
      if (sku && id) skuTo.set(sku, { id, nombre });
    }
  }

  // 2) Entradas: padres por talles (lista de sku_base) y padres por color (sku_base + colores)
  const vtDir = path.resolve(REPO_ROOT, "data/variantes_talle");
  const vtFiles = (await fs.pathExists(vtDir)) ? (await fs.readdir(vtDir)).filter(f=>/\.(csv|xlsx)$/i.test(f)).map(f=>path.join(vtDir,f)) : [];
  const vtBases = new Set();
  for (const f of vtFiles) {
    const rows = await readTable(f);
    for (const r of rows) {
      const base = String(r.sku_base || r.base || r.sku || "").trim().toUpperCase();
      if (base) vtBases.add(base);
    }
  }

  const colorsMap = await loadColorsMap(REPO_ROOT);
  const vcBases = new Set(colorsMap.keys());

  // 3) Maestro: para resolver curvas automáticamente
  const maestroRows = await loadMaestroRows();

  // 4) Armar variaciones SIEMPRE CON TALLES
  const rowsGlobal = [];
  const activarGlobal = [];
  const padresSinId = [];
  const padresSinCurva = [];
  const tallesDesconocidos = [];
  const coloresDesconocidos = [];

  // 4.A) Solo talles (sin color)
  for (const skuBase of vtBases) {
    if (!skuTo.has(skuBase)) { padresSinId.push(skuBase); continue; }
    const { id: idPadre, nombre: nombrePadre } = skuTo.get(skuBase);
    const curvaRaw = curvaForBase(maestroRows, skuBase);
    const talles = tallesFromCurva(curvaRaw);
    if (!talles.length) { padresSinCurva.push(`${skuBase}\t${curvaRaw}`); continue; }

    for (const talle of talles) {
      const token = tokenForTalle(talle);
      if (!token) { tallesDesconocidos.push(`${skuBase}\t${talle}\t${curvaRaw}`); continue; }
      const skuVar = `${skuBase}##${token}`;
      const nombreVar = `${nombrePadre} - ${talle}`;
      const row = buildRow({ idPadre, skuVar, nombreVar, colorName: "", talle });
      rowsGlobal.push(row);
      activarGlobal.push(skuVar);
    }

    const outPadre = path.join(OUT_SPLIT_DIR, `${skuBase}.csv`);
    await writeCsv(outPadre, HEADERS, rowsGlobal.filter(x => String(x["SKU"]).startsWith(skuBase)));
  }

  // 4.B) Color + talles
  for (const [skuBase, colors] of colorsMap) {
    if (!skuTo.has(skuBase)) { padresSinId.push(skuBase); continue; }
    const { id: idPadre, nombre: nombrePadre } = skuTo.get(skuBase);
    const curvaRaw = curvaForBase(maestroRows, skuBase);
    const talles = tallesFromCurva(curvaRaw);
    if (!talles.length) { padresSinCurva.push(`${skuBase}\t${curvaRaw}`); continue; }

    for (const c of colors) {
      const { code: colorCode, name: colorName } = c;
      if (!colorCode) { coloresDesconocidos.push(`${skuBase}\t(NOCODE)`); continue; }
      for (const talle of talles) {
        const token = tokenForTalle(talle);
        if (!token) { tallesDesconocidos.push(`${skuBase}\t${talle}\t${curvaRaw}`); continue; }
        const skuVar = `${skuBase}${colorCode}##${token}`;
        const nombreVar = `${nombrePadre} - ${colorName} - ${talle}`;
        const row = buildRow({ idPadre, skuVar, nombreVar, colorName: (colorName || colorCode), talle });
        rowsGlobal.push(row);
        activarGlobal.push(skuVar);
      }
    }

    const outPadre = path.join(OUT_SPLIT_DIR, `${skuBase}.csv`);
    await writeCsv(outPadre, HEADERS, rowsGlobal.filter(x => String(x["SKU"]).startsWith(skuBase)));
  }

  // 5) Salidas
  await writeCsv(path.resolve(REPO_ROOT, outCsv), HEADERS, rowsGlobal);
  await fs.writeFile(path.resolve(REPO_ROOT, outTxt), activarGlobal.join("\n"), "utf-8");

  // Logs
  const stamp = new Date().toISOString().slice(0,19).replace(/:/g,"");
  const writeIf = async (arr, name) => {
    if (arr.length) await fs.writeFile(path.join(LOGS_DIR, `${name}_${stamp}.txt`), uniq(arr).sort().join("\n"));
  };
  await writeIf(padresSinId, "padres_sin_id");
  await writeIf(padresSinCurva, "padres_sin_curva");
  await writeIf(tallesDesconocidos, "talles_desconocidos");
  await writeIf(coloresDesconocidos, "colores_desconocidos");

  console.log("✅ Variantes generadas:", rowsGlobal.length, "filas.");
}

main().catch(err => { console.error(err); process.exit(1); });
