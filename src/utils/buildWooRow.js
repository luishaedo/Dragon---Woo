
import { uniqJoin } from "./text.js";
import { getCategoriaRuta, getEtiquetas, getTalles, getDimensiones } from "./dicts.js";

export function buildParentRow(HEADERS, { sku, nombre, maestro, tipificaciones, correspondencias, overrides }) {
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
  const tipoNombre = (overrides?.tipo_over || tipos[maestro.tipo] || "");
  const curvaNombre = curvas[maestro.curva] || "";

  const categoriaRuta = overrides?.categoria_over || getCategoriaRuta(categoriaNombre, genero, correspondencias);

  const etqParts = getEtiquetas({ categoriaNombre, marca, genero, clasificacionNombre, tipoNombre }, correspondencias);
  const etiquetas = uniqJoin([etqParts.base, etqParts.marcaTag, etqParts.generoTag, etqParts.clasifTags, etqParts.tipoTags, overrides?.etiquetas_extra]);

  const talles = getTalles(curvaNombre, correspondencias, overrides?.talles);
  const tallesStr = talles.join(", ");
  const attr1Default = talles[0] || "";

  const dims = getDimensiones(categoriaNombre, correspondencias, overrides);

  const row = {};
  for (const h of HEADERS) row[h] = "";

  row["ID"] = "";
  row["Tipo"] = "variable";
  row["SKU"] = sku;
  row["Nombre"] = nombre;
  row["Publicado"] = "1";
  row["¿Está destacado?"] = "1";
  row["Visibilidad en el catálogo"] = "visible";
  row["Estado del impuesto"] = "taxable";

  row["Peso (kg)"] = dims.peso;
  row["Longitud (cm)"] = dims.largo;
  row["Anchura (cm)"] = dims.ancho;
  row["Altura (cm)"] = dims.alto;

  row["Categorías"] = categoriaRuta;
  row["Etiquetas"] = etiquetas;
  row["Marcas"] = marca;

  row["Nombre del atributo 1"] = "Talle";
  row["Valor(es) del atributo 1"] = tallesStr;
  row["Atributo visible 1"] = "1";
  row["Atributo global 1"] = "1";
  row["Atributo por defecto 1"] = attr1Default;

  row["Nombre del atributo 2"] = "Marca";
  row["Valor(es) del atributo 2"] = marca;
  row["Atributo visible 2"] = "1";
  row["Atributo global 2"] = "1";

  return row;
}

export function buildVariationRow(HEADERS, { skuBase, nombre, talle, token, idPadre, dims }) {
  const row = {};
  for (const h of HEADERS) row[h] = "";
  row["ID"] = "";
  row["Tipo"] = "variation";
  row["SKU"] = `${skuBase}##${token}`;
  row["Nombre"] = `${nombre} - ${talle}`;
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
  return row;
}
