import fs from "fs-extra";
import path from "path";
import { readTable } from "./readTable.js";

/**
 * Carga un mapa sku_base -> [{ code, name }]
 * Busca CSV/XLSX en (prioridad):
 *   - data/variantes_color/*.csv|xlsx
 *   - data/var_colores.csv (legacy)
 *   - data/var_colores.xlsx (legacy)
 * Columnas esperadas (flexibles en nombre):
 *   - sku_base | base | sku
 *   - color_code | code | cod | color
 *   - color_name | name | nombre
 */
export async function loadColorsMap(repoRootAbsPath, overrideDir = null) {
  const dataDir = path.resolve(repoRootAbsPath, "data");
  const vcolDir = path.join(dataDir, "variantes_color");
  const legacyCsv = path.join(dataDir, "var_colores.csv");
  const legacyXlsx = path.join(dataDir, "var_colores.xlsx");

  const files = [];
  // If overrideDir is provided, use only that directory
  if (overrideDir) {
    const dir = path.isAbsolute(overrideDir) ? overrideDir : path.join(repoRootAbsPath, overrideDir);
    if (await fs.pathExists(dir)) {
      const all = await fs.readdir(dir);
      for (const fname of all) {
        const ext = path.extname(fname).toLowerCase();
        if (ext === ".csv" || ext === ".xlsx") files.push(path.join(dir, fname));
      }
    }
  }

  if (await fs.pathExists(vcolDir)) {
    const all = await fs.readdir(vcolDir);
    for (const fname of all) {
      const ext = path.extname(fname).toLowerCase();
      if (ext === ".csv" || ext === ".xlsx") {
        files.push(path.join(vcolDir, fname));
      }
    }
  }
  if (files.length === 0) {
    if (await fs.pathExists(legacyCsv)) files.push(legacyCsv);
    else if (await fs.pathExists(legacyXlsx)) files.push(legacyXlsx);
  }

  const norm = s => String(s || "").trim();

  const map = new Map(); // base -> Map(code -> name)
  for (const f of files) {
    const rows = await readTable(f);
    for (const r of rows) {
      const base = norm(r.sku_base || r.base || r.sku);
      const code = norm(r.color_code || r.code || r.cod || r.color);
      const name = norm(r.color_name || r.name || r.nombre);
      if (!base || !code) continue;
      if (!map.has(base)) map.set(base, new Map());
      const inner = map.get(base);
      if (!inner.has(code)) inner.set(code, name || code);
    }
  }

  const out = new Map();
  for (const [base, inner] of map) {
    out.set(base, Array.from(inner.entries()).map(([code, name]) => ({ code, name })));
  }
  return out;
}
