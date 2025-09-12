import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import xlsx from "xlsx";

// --- Helpers: autodetección de codificación y separador ---
function decodeSmart(buffer) {
  // UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.slice(3).toString("utf8");
  }
  const asUtf8 = buffer.toString("utf8");
  // Heurística de mojibake ("CÃ³digo", "CategorÃ­a", etc.)
  const mojibake = (asUtf8.match(/[ÃÂ][\x80-\xBF]?/g) || []).length;
  if (mojibake >= 2) {
    // Probable Windows-1252/Latin1
    return buffer.toString("latin1");
  }
  return asUtf8;
}

function guessDelimiter(sampleText) {
  const lines = sampleText.split(/\r?\n/).filter(l => l.trim()).slice(0, 10);
  const counts = { ";": 0, ",": 0, "\t": 0, "|": 0 };
  const delims = [";", ",", "\t", "|"];
  for (const line of lines) {
    // ignorar lo que está entre comillas para contar separadores reales
    const stripped = line.replace(/\\"/g, "").replace(/"[^"]*"/g, "");
    for (const d of delims) {
      const re = new RegExp(d === "\t" ? "\t" : d, "g");
      counts[d] += (stripped.match(re) || []).length;
    }
  }
  let best = ",", bestN = -1;
  for (const d of delims) {
    if (counts[d] > bestN) { best = d; bestN = counts[d]; }
  }
  return best;
}

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

  // entrada_padres
  ["sku_base","sku_base"],["talles","talles"],["etiquetas_extra","etiquetas_extra"],
  ["categoria_over","categoria_over"],["marca_over","marca_over"],["genero_over","genero_over"],["tipo_over","tipo_over"],
  ["peso_over","peso_over"],["largo_over","largo_over"],["ancho_over","ancho_over"],["alto_over","alto_over"]
]);

function normalizeRows(rows) {
  return rows.map(row => {
    const out = {};
    for (const k of Object.keys(row)) {
      const keyNorm = normalizeHeader(k);
      const canon = CANON_MAP.get(keyNorm) || keyNorm;
      out[canon] = (row[k] ?? "").toString().trim();
    }
    return out;
  });
}

// ===== EXPORT nombrado =====
export async function readTable(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".xlsx" || ext === ".xls") {
    const wb = xlsx.readFile(filePath, { cellDates:false, cellText:false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
    return normalizeRows(rows);
  }

  if (ext === ".csv") {
    const buf = fs.readFileSync(filePath);
    const text = decodeSmart(buf);
    const delim = guessDelimiter(text);

    const records = [];
    await new Promise((resolve, reject) => {
      parse(text, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
        delimiter: delim
      })
        .on("readable", function () {
          let r; while ((r = this.read()) !== null) records.push(r);
        })
        .on("error", reject)
        .on("end", resolve);
    });

    const out = records.map(row => {
      const nrow = {};
      for (const [k, v] of Object.entries(row)) {
        const canon = CANON_MAP.get(normalizeHeader(k)) || normalizeHeader(k);
        nrow[canon] = (typeof v === "string") ? v.trim() : v;
      }
      return nrow;
    });
    return out;
  }

  throw new Error(`Formato no soportado: ${ext}`);
}
