
import fs from "fs-extra";
import path from "path";
import { readTable } from "./readTable.js";

/**
 * Carga un mapa sku_base -> [{ code, name }]
 * Busca data/var_colores.csv o data/var_colores.xlsx en el repo.
 * - Deduplica por code manteniendo el primer nombre.
 */
export async function loadColorsMap(repoRootAbsPath) {
  const dataDir = path.resolve(repoRootAbsPath, "data");
  const csvPath = path.join(dataDir, "var_colores.csv");
  const xlsxPath = path.join(dataDir, "var_colores.xlsx");

  const rows = [];
  if (await fs.pathExists(csvPath)) {
    const r = await readTable(csvPath);
    rows.push(...r);
  } else if (await fs.pathExists(xlsxPath)) {
    const r = await readTable(xlsxPath);
    rows.push(...r);
  } else {
    return new Map(); // no hay archivo: no hay colores
  }

  function pick(o, keys) {
    const out = {};
    for (const k of keys) out[k] = o[k] ?? o[k.toLowerCase()] ?? o[k.toUpperCase()] ?? "";
    return out;
  }

  const map = new Map();
  for (const row of rows) {
    const { sku_base, color_code, color_name } = pick(row, ["sku_base","color_code","color_name"]);
    const base = String(sku_base || "").trim();
    const code = String(color_code || "").trim();
    const name = String(color_name || "").trim();
    if (!base || !code) continue;

    if (!map.has(base)) map.set(base, new Map());
    const inner = map.get(base);
    if (!inner.has(code)) inner.set(code, name || code);
  }

  const out = new Map();
  for (const [k, inner] of map) {
    out.set(k, Array.from(inner.entries()).map(([code, name]) => ({ code, name })));
  }
  return out;
}
