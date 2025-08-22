
import fs from "fs";
import path from "path";

export function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function getCategoriaRuta(categoriaNombre, genero, correspondencias) {
  const cmap = correspondencias.categoria_map || {};
  const entry = cmap[categoriaNombre];
  if (entry && entry[genero]) return entry[genero];
  if (genero && categoriaNombre) {
    const gen = genero.toUpperCase();
    const catDisp = categoriaNombre.charAt(0).toUpperCase() + categoriaNombre.slice(1).toLowerCase();
    return `${gen}, ${gen} > ${catDisp}`;
  }
  return "";
}

export function getEtiquetas({ categoriaNombre, marca, genero, clasificacionNombre, tipoNombre }, correspondencias) {
  const base = (correspondencias.etiquetas_base_por_categoria || {})[categoriaNombre] || [];
  const clasifTags = (correspondencias.clasificacion_tags_map || {})[clasificacionNombre] || [];
  const tipoTags = (correspondencias.tipo_tags_map || {})[tipoNombre] || [];
  const generoTag = genero ? (genero.charAt(0) + genero.slice(1).toLowerCase()) : "";
  return { base, clasifTags, tipoTags, generoTag, marcaTag: marca };
}

export function getTalles(curvaNombre, correspondencias, overrideListStr) {
  if (overrideListStr) {
    const t = overrideListStr.split(/[|,;]+/).map(s => s.trim()).filter(Boolean);
    return t;
  }
  const map = correspondencias.curva_talles_map || {};
  return map[curvaNombre] || [];
}

export function getDimensiones(categoriaNombre, correspondencias, ovr) {
  const dims = (correspondencias.dimensiones_por_categoria || {})[categoriaNombre] || {};
  return {
    peso: ovr?.peso_over || dims.peso || "",
    largo: ovr?.largo_over || dims.largo || "",
    ancho: ovr?.ancho_over || dims.ancho || "",
    alto: ovr?.alto_over || dims.alto || ""
  };
}
