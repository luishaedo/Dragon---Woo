
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { readTable } from "../utils/readTable.js";
import { writeCsv } from "../utils/csv.js";
import { loadJSON } from "../utils/dicts.js";
import { buildVariationRow } from "../utils/buildWooRow.js";
import { loadColorsMap } from "../utils/colors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../");

const HEADERS = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../config/headers_woo.json"), "utf-8"));
const correspondencias = loadJSON(path.resolve(__dirname, "../../config/correspondencias.json"));
const tipificaciones = loadJSON(path.resolve(__dirname, "../../config/tipificaciones_codigos.json"));
const TMAP = loadJSON(path.resolve(__dirname, "../../config/talles_map.json"));

// argv
const exportWooPath = process.argv[2];  // data/export_woo_padres.csv (con ID y SKU)
const outCsv = process.argv[3];         // out/woo_variantes.csv
const outTxt = process.argv[4];         // out/dragonfish_activar.txt

if (!exportWooPath || !outCsv || !outTxt) {
  console.error("Uso: node 04_generar_variantes.js <export_woo_padres.csv> <out_variantes.csv> <out_activar.txt>");
  process.exit(1);
}

await fs.ensureDir(path.dirname(outCsv));
await fs.ensureDir(path.dirname(outTxt));
const LOGS_DIR = path.resolve(REPO_ROOT, "logs");
await fs.ensureDir(LOGS_DIR);

// Cargar export Woo (IDs), maestro (para dims), y colores
const exportWoo = await readTable(exportWooPath);
const maestroPathGuess = path.resolve(REPO_ROOT, "data/maestro_dragonfish.xlsx");
const maestro = (await fs.pathExists(maestroPathGuess)) ? await readTable(maestroPathGuess) : [];

const colorsMap = await loadColorsMap(REPO_ROOT);

// Mapa SKU -> ID (padres)
const skuToId = new Map();
for (const r of exportWoo) {
  const id = r.id || r["id"] || r["ID"];
  const sku = r.sku || r["sku"] || r["SKU"];
  if (id && sku) skuToId.set(String(sku).trim(), String(id).trim());
}

// Maestro por sku
const maestroBySku = new Map();
for (const m of maestro) {
  const sku = m.codigo || m.sku || m.SKU || m.CODIGO;
  if (!sku) continue;
  maestroBySku.set(String(sku).trim(), m);
}

// Util: dimensiones mínimas (overrides/resumen). Aquí podemos expandir si hace falta.
function getDims() {
  return { peso: "", largo: "", ancho: "", alto: "" };
}

// Token por talle
function tokenForTalle(talle) {
  return TMAP[talle] || (String(talle).split("/")[0]);
}

// Talles disponibles (usamos las claves del TMAP para simplificar)
const allTalles = Object.keys(TMAP);

const rowsOut = [];
const activar = [];
const noId = [];

// Nombre de padre (si viene en export), por estética del nombre de variación
const nameBySku = new Map();
for (const r of exportWoo) {
  const sku = r.sku || r["SKU"] || r["sku"];
  const name = r.nombre || r["Nombre"] || r["name"] || "";
  if (sku) nameBySku.set(String(sku).trim(), String(name || "").trim());
}

for (const [sku, idPadre] of skuToId.entries()) {
  const padreName = nameBySku.get(sku) || sku;
  const dims = getDims();

  const colors = colorsMap.get(sku) || null;

  if (!idPadre) { noId.push(`${sku}`); continue; }

  if (colors && colors.length) {
    for (const c of colors) {
      const colorCode = c.code;
      const colorName = c.name || c.code;
      for (const talle of allTalles) {
        const token = tokenForTalle(talle);
        const row = buildVariationRow(HEADERS, {
          skuBase: sku, idPadre, nombre: padreName, talle, token, dims, colorCode, colorName
        });
        rowsOut.push(row);
        activar.push(`${sku}${colorCode}##${token}`);
      }
    }
  } else {
    for (const talle of allTalles) {
      const token = tokenForTalle(talle);
      const row = buildVariationRow(HEADERS, {
        skuBase: sku, idPadre, nombre: padreName, talle, token, dims
      });
      rowsOut.push(row);
      activar.push(`${sku}##${token}`);
    }
  }
}

if (noId.length) fs.writeFileSync(path.join(LOGS_DIR, "padres_sin_id.txt"), noId.join("\n"), "utf-8");

const csv = writeCsv(HEADERS, rowsOut);
fs.writeFileSync(outCsv, csv, "utf-8");
fs.writeFileSync(outTxt, activar.join("\n"), "utf-8");

console.log("✅ Generado:", outCsv);
console.log("✅ Generado:", outTxt);
