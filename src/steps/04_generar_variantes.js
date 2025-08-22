
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { readTable } from "../utils/readTable.js";
import { writeCsv } from "../utils/csv.js";
import { loadJSON } from "../utils/dicts.js";
import { buildVariationRow } from "../utils/buildWooRow.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEADERS = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../config/headers_woo.json"), "utf-8"));
const correspondencias = loadJSON(path.resolve(__dirname, "../../config/correspondencias.json"));
const tipificaciones = loadJSON(path.resolve(__dirname, "../../config/tipificaciones_codigos.json"));
const TMAP = loadJSON(path.resolve(__dirname, "../../config/talles_map.json"));

const LOGS_DIR = path.resolve(__dirname, "../../logs");
await fs.ensureDir(LOGS_DIR);

const [,, entradaX, maestroPath, exportWooPath, outCsv, outTxt] = process.argv;
if (!entradaX || !maestroPath || !exportWooPath || !outCsv || !outTxt) {
  console.error("Uso: node src/steps/04_generar_variantes.js <entrada_padres.xlsx> <maestro_dragonfish.xlsx|csv> <export_woo_padres.csv> <out_variantes.csv> <out_txt>");
  process.exit(1);
}

const entrada = await readTable(entradaX);
const maestro = await readTable(maestroPath);
const exportWoo = await readTable(exportWooPath);

const skuToId = new Map();
for (const r of exportWoo) {
  const id = r.id || r["id"] || r["ID"];
  const sku = r.sku || r["sku"] || r["SKU"];
  if (id && sku) skuToId.set(sku, id);
}

const maestroBySku = new Map();
for (const m of maestro) {
  const sku = m.codigo || m.sku;
  if (!sku) continue;
  maestroBySku.set(sku, {
    proveedor: (m.proveedor || "").padStart(2,"0"),
    familia: (m.familia || "").padStart(2,"0"),
    curva: (m.curva || m["curva de talles"] || "").padStart(2,"0"),
    categoria: (m.categoria || "").padStart(2,"0"),
    clasificacion: (m.clasificacion || "").padStart(2,"0"),
    tipo: (m.tipo || "").padStart(2,"0"),
    descripcion: m.descripcion || ""
  });
}

function tokenFromTalle(t) {
  return TMAP[t] || (t.includes("/") ? t.split("/")[0].trim() : t);
}

const categorias = tipificaciones.categorias || {};
const curvas = tipificaciones.curvas || {};

const rowsOut = [];
const activar = [];
const noId = [];
for (const e of entrada) {
  const sku = e.sku_base || e.codigo || e.sku;
  const nombre = e.nombre || maestroBySku.get(sku)?.descripcion || e.descripcion || "";
  if (!sku) continue;
  const idPadre = skuToId.get(sku);
  if (!idPadre) { noId.push(sku); continue; }

  const m = maestroBySku.get(sku);
  if (!m) continue;

  const categoriaNombre = categorias[m.categoria] || "";
  const curvaNombre = curvas[m.curva] || "";
  const dims = (correspondencias.dimensiones_por_categoria || {})[categoriaNombre] || {};

  let talles = [];
  if (e.talles) {
    talles = e.talles.split(/[|,;]+/).map(s => s.trim()).filter(Boolean);
  } else {
    const map = correspondencias.curva_talles_map || {};
    talles = map[curvaNombre] || [];
  }

  for (const t of talles) {
    const token = tokenFromTalle(t);
    rowsOut.push(buildVariationRow(HEADERS, {
      skuBase: sku,
      nombre,
      talle: t,
      token,
      idPadre,
      dims
    }));
    activar.push(`${sku}##${token}`);
  }
}

if (noId.length) fs.writeFileSync(path.join(LOGS_DIR, "padres_sin_id.txt"), noId.join("\n"), "utf-8");

const csv = writeCsv(HEADERS, rowsOut);
await fs.ensureDir(path.dirname(outCsv));
fs.writeFileSync(outCsv, csv, "utf-8");
fs.writeFileSync(outTxt, activar.join("\n"), "utf-8");

console.log("✅ Generado:", outCsv);
console.log("✅ Generado:", outTxt);
