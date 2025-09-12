
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { readTable } from "../utils/readTable.js";
import { writeCsv } from "../utils/csv.js";
import { loadJSON } from "../utils/dicts.js";
import { buildParentRow } from "../utils/buildWooRow.js";
import { loadColorsMap } from "../utils/colors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../");

const HEADERS = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../config/headers_woo.json"), "utf-8"));

// === Woo parents minimal header set (per request) ===
const KEEP_HEADERS = [
  "Tipo",
  "SKU",
  "Nombre",
  "Publicado",
  "¿Está destacado?",
  "Visibilidad en el catálogo",
  "Estado del impuesto",
  "¿Existencias?",
  "¿Vendido individualmente?",
  "Categorías",
  "Etiquetas",
  "Nombre del atributo 1",
  "Valor(es) del atributo 1",
  "Atributo visible 1",
  "Atributo global 1",
  "Atributo por defecto 1",
  "Nombre del atributo 2",
  "Valor(es) del atributo 2",
  "Atributo visible 2",
  "Atributo global 2"
];
const tipificaciones = loadJSON(path.resolve(__dirname, "../../config/tipificaciones_codigos.json"));
const correspondencias = loadJSON(path.resolve(__dirname, "../../config/correspondencias.json"));

// Helper: find maestro row for a base sku when only colored SKUs exist
function resolveMaestroForBaseSku(skuBase, maestroMap, colorsMap) {
  // 1) Try with colorsMap (preferred): base + known color_code
  const colors = colorsMap.get(skuBase) || [];
  const candidates = [];
  for (const c of colors) {
    const key = `${skuBase}${c.code}`;
    const row = maestroMap.get(key);
    if (row) candidates.push(row);
  }
  // 2) If still none, scan maestro keys that start with base and have a 3-digit numeric suffix
  if (!candidates.length) {
    for (const k of maestroMap.keys()) {
      if (k.startsWith(skuBase)) {
        const suf = k.slice(skuBase.length);
        if (/^\d{3}$/.test(suf)) candidates.push(maestroMap.get(k));
      }
    }
  }
  if (!candidates.length) return { row: null, colorsDerived: [] };

  // Majority vote for key fields
  function majority(field) {
    const freq = new Map();
    for (const r of candidates) {
      const v = (r?.[field] ?? "").toString();
      if (!v) continue;
      freq.set(v, (freq.get(v) || 0) + 1);
    }
    let best = ""; let max = 0;
    for (const [v, n] of freq.entries()) if (n > max) { best = v; max = n; }
    return best;
  }

  const synth = {
    proveedor: majority("proveedor") || candidates[0].proveedor || "",
    familia: majority("familia") || candidates[0].familia || "",
    categoria: majority("categoria") || candidates[0].categoria || "",
    clasificacion: majority("clasificacion") || candidates[0].clasificacion || "",
    tipo: majority("tipo") || candidates[0].tipo || "",
    curva: majority("curva") || candidates[0].curva || ""
  };

  // Derive colors if colorsMap didn't have them
  let colorsDerived = [];
  if (!colors.length) {
    const set = new Set();
    for (const r of candidates) {
      const k = (r.codigo || r.sku || "").toString();
      const suf = k.slice(skuBase.length);
      if (/^\d{3}$/.test(suf)) set.add(suf);
    }
    colorsDerived = Array.from(set).map(code => ({ code, name: code }));
  }

  return { row: synth, colorsDerived };
}

// argv
const entradaPadres = process.argv[2];      // data/entrada_padres.xlsx
const maestroPath   = process.argv[3];      // data/maestro_dragonfish.xlsx
const outCsv        = process.argv[4];      // out/woo_padres.csv

if (!entradaPadres || !maestroPath || !outCsv) {
  console.error("Uso: node 01_generar_padres.js <entrada_padres.xlsx|csv> <maestro.xlsx|csv> <out.csv>");
  process.exit(1);
}

await fs.ensureDir(path.dirname(outCsv));
const LOGS_DIR = path.resolve(REPO_ROOT, "logs");
await fs.ensureDir(LOGS_DIR);

// Cargar datos
const entrada = await readTable(entradaPadres);
const maestro = await readTable(maestroPath);
const colorsMap = await loadColorsMap(REPO_ROOT);

// Map maestro by SKU
const maestroBySku = new Map();
for (const m of maestro) {
  const sku = m.codigo || m.sku || m.SKU || m.CODIGO;
  if (!sku) continue;
  maestroBySku.set(String(sku).trim(), m);
}

const outRows = [];
const noEncontrados = [];
const codigosDesconocidos = [];

for (const e of entrada) {
  const sku = String(e.sku_base || e.sku || e.SKU || e.codigo || "").trim();
  const nombre = String(e.nombre || e.Nombre || e.descripcion || e["descripción"] || "").trim();
  if (!sku) continue;

  let maestroRow = maestroBySku.get(sku);
  let colors = colorsMap.get(sku) || null;
  if (!maestroRow) {
    const fb = resolveMaestroForBaseSku(sku, maestroBySku, colorsMap);
    maestroRow = fb.row;
    if (!colors && fb.colorsDerived && fb.colorsDerived.length) {
      colors = fb.colorsDerived;
    }
  }
  if (!maestroRow) { noEncontrados.push(sku); continue; }

  const overrides = {
    marca_over: e.marca_over || "",
    genero_over: e.genero_over || "",
    categoria_over_name: e.categoria_over_name || "",
    desc_corta_over: e.desc_corta_over || "",
    desc_over: e.desc_over || "",
    peso_over: e.peso_over || "",
    largo_over: e.largo_over || "",
    ancho_over: e.ancho_over || "",
    alto_over: e.alto_over || ""
  };

  const row = buildParentRow(HEADERS, {
    sku, nombre, maestro: maestroRow, tipificaciones, correspondencias, overrides, colors
  });
  outRows.push(row);
}

if (noEncontrados.length) fs.writeFileSync(path.join(LOGS_DIR,"padres_no_encontrados.txt"), noEncontrados.join("\n"), "utf-8");
if (codigosDesconocidos.length) fs.writeFileSync(path.join(LOGS_DIR,"codigos_desconocidos.txt"), codigosDesconocidos.join("\n"), "utf-8");


// Compute "removed columns" for visibility
const removed = (HEADERS || []).filter(h => !KEEP_HEADERS.includes(h) && h !== '...');
if (removed?.length) {
  const removedTxt = removed.join("\\n"); // 👈 importante: doble backslash
  await fs.ensureDir(path.dirname(outCsv));
  fs.writeFileSync(path.join(path.dirname(outCsv), "padres_columnas_eliminadas.txt"), removedTxt, "utf-8");
  console.log("ℹ️  Columnas eliminadas (guardadas en padres_columnas_eliminadas.txt):", removed.length);
}

// Split output in chunks of 20 rows
const total = outRows.length;
const chunkSize = 20;
await fs.ensureDir(path.dirname(outCsv));
const { name, dir, ext } = path.parse(outCsv);
let fileCount = 0;
for (let i = 0; i < total; i += chunkSize) {
  const chunk = outRows.slice(i, i + chunkSize);
  fileCount++;
  const suffix = String(fileCount).padStart(2, '0');
  const outPart = path.join(dir, `${name}.part-${suffix}${ext}`);
  const csvPart = writeCsv(KEEP_HEADERS, chunk);
  fs.writeFileSync(outPart, csvPart, "utf-8");
  console.log(`✅ Generado: ${outPart} (${chunk.length} filas)`);
}

