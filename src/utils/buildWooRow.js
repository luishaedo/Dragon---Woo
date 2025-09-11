
import { uniqJoin } from "./text.js";
import { getCategoriaRuta, getEtiquetas, getTalles, getDimensiones } from "./dicts.js";

/**
 * Construye una fila de producto padre (variable).
 * Si "colors" (array) está presente, agrega el atributo 2 = Color y mueve Marca al 3.
 */
export function buildParentRow(HEADERS, { sku, nombre, maestro, tipificaciones, correspondencias, overrides, colors }) {
  const proveedores = tipificaciones.proveedores || {};
  const familias = tipificaciones.familias || {};
  const categorias = tipificaciones.categorias || {};
  const clasificaciones = tipificaciones.clasificaciones || {};
  const tipos = tipificaciones.tipos || {};
  const curvas = tipificaciones.curvas || {};

  const marca = overrides?.marca_over || proveedores[maestro.proveedor] || "";
  const genero = (overrides?.genero_over || familias[maestro.familia] || "").toUpperCase();
  const categoriaNombre = overrides?.categoria_over_name || categorias[maestro.categoria] || "";
  const clasificacionNombre = clasificaciones[maestro.clasificacion] || "";
  const tipoNombre = tipos[maestro.tipo] || "";

  const dims = getDimensiones(categoriaNombre, correspondencias, overrides);
  const catRuta = getCategoriaRuta(categoriaNombre, genero, correspondencias);
  const etqParts = getEtiquetas({ categoriaNombre, marca, genero, clasificacionNombre, tipoNombre }, correspondencias);
  const etiquetas = uniqJoin([overrides?.tags_over, etqParts.base, etqParts.clasifTags, etqParts.tipoTags, etqParts.generoTag, etqParts.marcaTag]);

  const talles = getTalles(curvas[maestro.curva] || maestro.curva, correspondencias);
  const tallesVisibles = Array.from(new Set(talles)).join(", ");

  const hasColors = Array.isArray(colors) && colors.length > 0;
  const colorValues = hasColors ? Array.from(new Set(colors.map(c => c.name || c.code))).join(", ") : "";

  const row = {};
  for (const h of HEADERS) row[h] = "";

  row["ID"] = "";
  row["Tipo"] = "variable";
  row["SKU"] = sku;
  row["GTIN, UPC, EAN o ISBN"] = "";
  row["Nombre"] = nombre;
  row["Publicado"] = "1";
  row["¿Está destacado?"] = "0";
  row["Visibilidad en el catálogo"] = "visible";
  row["Descripción corta"] = overrides?.desc_corta_over || "";
  row["Descripción"] = overrides?.desc_over || "";
  row["Día en que empieza el precio rebajado"] = "";
  row["Día en que termina el precio rebajado"] = "";
  row["Estado del impuesto"] = "taxable";
  row["Clase de impuesto"] = "";
  row["¿Existencias?"] = "1";
  row["¿Permitir pedidos pendientes?"] = "0";
  row["¿Vendido individualmente?"] = "0";
  row["Peso (kg)"] = dims?.peso || "";
  row["Longitud (cm)"] = dims?.largo || "";
  row["Anchura (cm)"] = dims?.ancho || "";
  row["Altura (cm)"] = dims?.alto || "";

  row["Categorías"] = catRuta || "";
  row["Etiquetas"] = etiquetas || "";

  row["Nombre del atributo 1"] = "Talle";
  row["Valor(es) del atributo 1"] = tallesVisibles;
  row["Atributo visible 1"] = "1";
  row["Atributo global 1"] = "1";
  row["Atributo por defecto 1"] = "";

  if (hasColors) {
    row["Nombre del atributo 2"] = "Color";
    row["Valor(es) del atributo 2"] = colorValues;
    row["Atributo visible 2"] = "1";
    row["Atributo global 2"] = "1";
    row["Atributo por defecto 2"] = "";
    row["Nombre del atributo 3"] = "Marca";
    row["Valor(es) del atributo 3"] = marca;
    row["Atributo visible 3"] = "1";
    row["Atributo global 3"] = "1";
    row["Atributo por defecto 3"] = "";
  } else {
    row["Nombre del atributo 2"] = "Marca";
    row["Valor(es) del atributo 2"] = marca;
    row["Atributo visible 2"] = "1";
    row["Atributo global 2"] = "1";
    row["Atributo por defecto 2"] = "";
  }

  return row;
}

export function buildVariationRow(HEADERS, { skuBase, idPadre, nombre, talle, token, dims, colorCode, colorName }) {
  const row = {};
  for (const h of HEADERS) row[h] = "";

  row["ID"] = "";
  row["Tipo"] = "variation";
  const sku = colorCode ? `${skuBase}${colorCode}##${token}` : `${skuBase}##${token}`;
  row["SKU"] = sku;
  const nameParts = [nombre];
  if (colorName) nameParts.push(colorName);
  nameParts.push(talle);
  row["Nombre"] = nameParts.join(" - ");
  row["Publicado"] = "1";
  row["¿Está destacado?"] = "0";
  row["Visibilidad en el catálogo"] = "visible";
  row["Estado del impuesto"] = "taxable";
  row["Superior"] = idPadre ? `id:${idPadre}` : "";
  row["Peso (kg)"] = dims?.peso || "";
  row["Longitud (cm)"] = dims?.largo || "";
  row["Anchura (cm)"] = dims?.ancho || "";
  row["Altura (cm)"] = dims?.alto || "";

  row["Nombre del atributo 1"] = "Talle";
  row["Valor(es) del atributo 1"] = talle;
  row["Atributo global 1"] = "1";

  if (colorCode || colorName) {
    row["Nombre del atributo 2"] = "Color";
    row["Valor(es) del atributo 2"] = colorName || colorCode;
    row["Atributo global 2"] = "1";
  }

  return row;
}
