
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import xlsx from "xlsx";

const ACCENTS = /[\u0300-\u036f]/g;
function normalizeHeader(s) {
  if (!s) return "";
  const noAcc = s.normalize("NFD").replace(ACCENTS, "");
  return noAcc.trim().toLowerCase().replace(/\s+/g, " ");
}

const CANON_MAP = new Map([
  ["codigo","codigo"],["código","codigo"],["sku","codigo"],
  ["descripcion","descripcion"],["descripción","descripcion"],["nombre","descripcion"],
  ["proveedor","proveedor"],
  ["familia","familia"],
  ["curva de talles","curva"],["curva","curva"],
  ["categoria","categoria"],["categoría","categoria"],
  ["clasificacion","clasificacion"],["clasificación","clasificacion"],
  ["tipo","tipo"],
  ["id","id"],

  // entrada_padres columns
  ["sku_base","sku_base"],["talles","talles"],["etiquetas_extra","etiquetas_extra"],
  ["categoria_over","categoria_over"],["marca_over","marca_over"],["genero_over","genero_over"],["tipo_over","tipo_over"],
  ["peso_over","peso_over"],["largo_over","largo_over"],["ancho_over","ancho_over"],["alto_over","alto_over"]
]);

export async function readTable(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    const wb = xlsx.readFile(filePath, { cellDates:false, cellText:false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
    return normalizeRows(rows);
  } else if (ext === ".csv") {
    const content = fs.readFileSync(filePath, "utf-8");
    return new Promise((resolve, reject) => {
      parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true }, (err, records) => {
        if (err) return reject(err);
        resolve(normalizeRows(records));
      });
    });
  } else {
    throw new Error(`Formato no soportado: ${ext}`);
  }
}

function normalizeRows(rows) {
  return rows.map(row => {
    const out = {};
    Object.keys(row).forEach(k => {
      const keyNorm = normalizeHeader(k);
      const canon = CANON_MAP.get(keyNorm) || keyNorm;
      out[canon] = (row[k] ?? "").toString().trim();
    });
    return out;
  });
}
