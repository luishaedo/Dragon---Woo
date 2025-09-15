// src/utils/curvas.js
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

// ---------- helpers ----------
function readJson(absPath) {
  if (!fs.pathExistsSync(absPath)) return null;
  const raw = fs.readFileSync(absPath, "utf-8");
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Carga los mapas de curvas desde config:
 * - config/correspondencias.json  → curva_talles_map (NombreLargo → [talles])
 * - config/tipificaciones_codigos.json → curvas (Codigo → NombreLargo)
 */
export function loadCurvaMap() {
  const corr = readJson(path.resolve(REPO_ROOT, "config/correspondencias.json")) || {};
  const tips = readJson(path.resolve(REPO_ROOT, "config/tipificaciones_codigos.json")) || {};
  const curvaByName = (corr.curva_talles_map || {});
  const curvaCodeToName = (tips.curvas || {});

  // normaliza claves por lower-case para matching tolerante
  const byName = new Map();
  for (const [name, list] of Object.entries(curvaByName)) {
    byName.set(String(name).trim().toLowerCase(), (list || []).map(String));
  }

  const codeToName = new Map();
  for (const [code, name] of Object.entries(curvaCodeToName)) {
    codeToName.set(String(code).trim(), String(name).trim());
  }

  return { byName, codeToName };
}

/**
 * Dado un valor de "curva" que puede venir como código ("03") o como cadena
 * ("NIÑO (02 al 20)"), devuelve el array de talles.
 */
export function tallesFromCurva(curvaRaw) {
  const raw = String(curvaRaw || "").trim();
  if (!raw) return [];

  const { byName, codeToName } = loadCurvaMap();

  // 1) si es código exacto (e.g. "03"), mapear a nombre y luego a talles
  if (codeToName.has(raw)) {
    const name = codeToName.get(raw);
    const list = byName.get(String(name).toLowerCase());
    if (Array.isArray(list) && list.length) return list;
  }

  // 2) intentar por nombre largo (case-insensitive)
  const list2 = byName.get(raw.toLowerCase());
  if (Array.isArray(list2) && list2.length) return list2;

  // 3) heurística: buscar por inclusión parcial (por si el texto viene recortado)
  for (const [nameLc, list] of byName.entries()) {
    if (nameLc.includes(raw.toLowerCase())) {
      if (Array.isArray(list) && list.length) return list;
    }
  }

  return [];
}

/** Convierte un talle a token para el SKU (e.g., "28/38" → "28"). */
export function tokenForTalle(talle) {
  const raw = String(talle || "").trim();
  if (!raw) return "";
  const i = raw.indexOf("/");
  if (i > 0) return raw.slice(0, i).trim();
  return raw;
}
