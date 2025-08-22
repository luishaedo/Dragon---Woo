
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { readTable } from "../utils/readTable.js";
import { writeCsv } from "../utils/csv.js";
import { loadJSON } from "../utils/dicts.js";
import { buildParentRow } from "../utils/buildWooRow.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEADERS = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../config/headers_woo.json"), "utf-8"));
const tipificaciones = loadJSON(path.resolve(__dirname, "../../config/tipificaciones_codigos.json"));
const correspondencias = loadJSON(path.resolve(__dirname, "../../config/correspondencias.json"));

const LOGS_DIR = path.resolve(__dirname, "../../logs");
await fs.ensureDir(LOGS_DIR);

const [,, entradaX, maestroPath, outCsv] = process.argv;
if (!entradaX || !maestroPath || !outCsv) {
  console.error("Uso: node src/steps/01_generar_padres.js <entrada_padres.xlsx> <maestro_dragonfish.xlsx|csv> <out.csv>");
  process.exit(1);
}

const entrada = await readTable(entradaX);
const maestro = await readTable(maestroPath);

const maestroBySku = new Map();
for (const m of maestro) {
  const sku = m.codigo || m.sku;
  if (sku) maestroBySku.set(sku, {
    proveedor: (m.proveedor || "").padStart(2,"0"),
    familia: (m.familia || "").padStart(2,"0"),
    curva: (m.curva || m["curva de talles"] || "").padStart(2,"0"),
    categoria: (m.categoria || "").padStart(2,"0"),
    clasificacion: (m.clasificacion || "").padStart(2,"0"),
    tipo: (m.tipo || "").padStart(2,"0"),
    descripcion: m.descripcion || ""
  });
}

const noEncontrados = [];
const codigosDesconocidos = [];

function checkCode(dict, val, campo, sku) {
  if (!val) return;
  if (!dict[val]) {
    codigosDesconocidos.push(`${sku}\t${campo}\t${val}`);
  }
}

const outRows = [];
for (const e of entrada) {
  const sku = e.sku_base || e.codigo || e.sku;
  const nombre = e.nombre || maestroBySku.get(sku)?.descripcion || e.descripcion || "";
  if (!sku || !nombre) { noEncontrados.push(`${sku || "(sin sku)"}\tFalta nombre o sku`); continue; }

  const m = maestroBySku.get(sku);
  if (!m) { noEncontrados.push(`${sku}\tNo está en maestro`); continue; }

  const tipificacionesObj = {
    proveedores: (await import("../../config/tipificaciones_codigos.json", { assert: { type: "json" } }).catch(()=>({})))?.default || tipificaciones.proveedores,
    familias: tipificaciones.familias,
    categorias: tipificaciones.categorias,
    clasificaciones: tipificaciones.clasificaciones,
    tipos: tipificaciones.tipos,
    curvas: tipificaciones.curvas
  };

  checkCode(tipificaciones.proveedores, m.proveedor, "proveedor", sku);
  checkCode(tipificaciones.familias, m.familia, "familia", sku);
  checkCode(tipificaciones.categorias, m.categoria, "categoria", sku);
  checkCode(tipificaciones.clasificaciones, m.clasificacion, "clasificacion", sku);
  checkCode(tipificaciones.tipos, m.tipo, "tipo", sku);
  checkCode(tipificaciones.curvas, m.curva, "curva", sku);

  const row = buildParentRow(HEADERS, {
    sku,
    nombre,
    maestro: m,
    tipificaciones,
    correspondencias,
    overrides: {
      talles: e.talles || "",
      etiquetas_extra: e.etiquetas_extra || "",
      categoria_over: e.categoria_over || "",
      categoria_over_name: "",
      marca_over: e.marca_over || "",
      genero_over: e.genero_over || "",
      tipo_over: e.tipo_over || "",
      peso_over: e.peso_over || "",
      largo_over: e.largo_over || "",
      ancho_over: e.ancho_over || "",
      alto_over: e.alto_over || ""
    }
  });
  outRows.push(row);
}

if (noEncontrados.length) fs.writeFileSync(path.join(LOGS_DIR,"no_encontrados.txt"), noEncontrados.join("\n"), "utf-8");
if (codigosDesconocidos.length) fs.writeFileSync(path.join(LOGS_DIR,"codigos_desconocidos.txt"), codigosDesconocidos.join("\n"), "utf-8");

const csv = writeCsv(HEADERS, outRows);
await fs.ensureDir(path.dirname(outCsv));
fs.writeFileSync(outCsv, csv, "utf-8");
console.log("✅ Generado:", outCsv);
