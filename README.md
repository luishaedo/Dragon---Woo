# nikita-woo-builder

Automatiza la creación de **productos padres (variable)** y **variaciones** para WooCommerce a partir de:
- un **maestro** con códigos Dragonfish (Proveedor, Familia, Curva, Categoría, Clasificación, Tipo), y
- un Excel mínimo con los **SKUs** y **nombres** a publicar.

El objetivo es **ahorrar carga manual** y **estandarizar** categorías, etiquetas, atributos y dimensiones.

---

## ⚙️ Requisitos

- **Node.js ≥ 18** (recomendado LTS)
- **npm ≥ 8**
- Conocer el flujo de importación/exportación de **WooCommerce**.

---

## 📂 Estructura del proyecto

```
nikita-woo-builder/
├─ package.json
├─ config/
│  ├─ headers_woo.json              # Encabezados de Woo (no tocar salvo que sepas lo que hacés)
│  ├─ tipificaciones_codigos.json   # Códigos Dragonfish → nombres (Proveedor/Familia/Categoría/Clasificación/Tipo/Curva)
│  ├─ correspondencias.json         # Reglas Woo: rutas de categoría, etiquetas base, dimensiones, talles por curva
│  └─ talles_map.json               # Mapa talle → token para SKU de variaciones (e.g. "30/40" → "30")
├─ data/
│  ├─ entrada_padres.xlsx           # Tu lista de SKUs a crear (min: sku_base, nombre)
│  ├─ maestro_dragonfish.xlsx       # Maestro DF con los códigos (puede ser .csv)
│  └─ export_woo_padres.csv         # Export de Woo tras importar padres (trae ID + SKU)
├─ out/
│  ├─ woo_padres.csv                # Salida: padres (variable)
│  ├─ woo_variantes.csv             # Salida: variaciones
│  └─ dragonfish_activar.txt        # Salida: SKUs de variación para estimular en Dragonfish
├─ logs/
│  ├─ no_encontrados.txt
│  ├─ codigos_desconocidos.txt
│  ├─ categorias_sin_mapa.txt
│  ├─ curvas_sin_talles.txt
│  └─ padres_sin_id.txt
└─ src/
   ├─ utils/
   │  ├─ readTable.js               # Lee XLSX/CSV y normaliza encabezados (acentos y espacios)
   │  ├─ csv.js                     # Serializa CSV con comillas y UTF-8
   │  ├─ dicts.js                   # Carga y helpers de mapeo (categorías, etiquetas, talles, dimensiones)
   │  ├─ text.js                    # Utilidad para deduplicar/combinar etiquetas
   │  └─ buildWooRow.js             # Construcción de filas Woo (padres/variaciones)
   └─ steps/
      ├─ 01_generar_padres.js       # Paso 1→2: genera out/woo_padres.csv
      └─ 04_generar_variantes.js    # Paso 4: genera out/woo_variantes.csv + out/dragonfish_activar.txt
```

---

## 📥 Archivos de **entrada**

### 1) `data/entrada_padres.xlsx`
Columnas mínimas:
- `sku_base` → código del artículo (igual al del maestro)
- `nombre` → nombre del producto padre en Woo

Columnas **opcionales** (overrides por producto):
- `talles` → lista para el **padre** (separada por `,` o `|`). Si no se indica, se toma de la **curva**.
- `etiquetas_extra` → agrega etiquetas a las generadas por reglas.
- `categoria_over` → ruta completa en Woo (p. ej. `HOMBRE, HOMBRE > JEANS`). Si la ponés, **se impone**.
- `marca_over`, `genero_over`, `tipo_over` → fuerzan esos valores (suelen no hacer falta).
- `peso_over`, `largo_over`, `ancho_over`, `alto_over` → dimensiones a nivel **padre**.

> **Precedencia:** overrides > códigos del maestro > reglas de correspondencias > heurísticas.

---

### 2) `data/maestro_dragonfish.xlsx|csv`
Encabezados esperados (se normalizan acentos/mayúsculas):
- `Código`, `Descripción`, `Proveedor`, `Familia`, `Curva de talles`, `Categoría`, `Clasificación`, `Tipo`

**Valores**:
- Son **códigos** de 2 dígitos (e.g. `01`, `12`), que se traducen con `config/tipificaciones_codigos.json`.

---

### 3) `data/export_woo_padres.csv` (solo para variaciones)
Export de Woo tras importar `woo_padres.csv`. Debe incluir al menos:
- `ID`, `SKU`

---

## 🧠 Lógica de mapeo (resumen)

| Campo Woo (padre) | Fuente | Regla |
|---|---|---|
| **Tipo** | fijo | `variable` |
| **Publicado** | fijo | `1` |
| **¿Está destacado?** | fijo | `1` |
| **Visibilidad** | fijo | `visible` |
| **Estado del impuesto** | fijo | `taxable` |
| **SKU** | maestro | `SKU = Código` |
| **Nombre** | entrada/maestro | `nombre` (o `Descripción` si no hay nombre) |
| **Marcas** | Proveedor | `Proveedor 01→Taverniti` (según `tipificaciones_codigos.json`) |
| **Categorías** | Categoría + Género | Ruta desde `correspondencias.categoria_map[categoriaNombre][GÉNERO]` |
| **Etiquetas** | compuesto | Base por categoría + Marca + Género + Clasificación + Tipo + `etiquetas_extra` |
| **Atributo 1** | Curva o override | `Nombre: Talle` ; `Valores: curva_talles_map[Curva]` |
| **Atributo 2** | Proveedor | `Nombre: Marca` ; `Valor: <marca>` |
| **Dimensiones** | Categoría o override | `dimensiones_por_categoria[categoriaNombre]` |

**Etiquetas (detalle)**:  
Se combinan y se deduplican en este orden:  
1) `etiquetas_base_por_categoria[categoría]`  
2) Marca  
3) Género (`Hombre`, `Mujer`, …)  
4) `clasificacion_tags_map[clasificación]`  
5) `tipo_tags_map[tipo]`  
6) `etiquetas_extra`  

---

## 🛠️ Uso paso a paso

### 0) Instalar dependencias
```bash
npm i
```

### 1) Generar **padres**
```bash
npm run gen:padres
# usa por defecto:
#  - data/entrada_padres.xlsx
#  - data/maestro_dragonfish.xlsx
#  - out/woo_padres.csv
```

**Salida**: `out/woo_padres.csv`  
**Logs** (si algo falta): `logs/no_encontrados.txt`, `logs/codigos_desconocidos.txt`, `logs/categorias_sin_mapa.txt`, `logs/curvas_sin_talles.txt`.

### 2) Importar en Woo
- Ir a **Productos → Importar**.
- Subir `out/woo_padres.csv`.
- Verificar el mapeo automático (los encabezados ya coinciden con Woo en español).
- Confirmar importación (**ID en blanco** crea productos nuevos).
- Al terminar, **Exportar** los productos resultantes para obtener **ID + SKU**.
- Guardar como `data/export_woo_padres.csv`.

> **Nota de atributos globales:** este proyecto marca `Atributo global 1/2 = 1`.  
> Asegurate de tener atributos globales **Talle** y **Marca** dados de alta en Woo (Productos → Atributos).  
> Si no existen, podés cambiar a `0` esos campos en el CSV o darlos de alta primero.

### 3) Generar **variaciones** + TXT Dragonfish
```bash
npm run gen:variantes
# usa por defecto:
#  - data/entrada_padres.xlsx
#  - data/maestro_dragonfish.xlsx
#  - data/export_woo_padres.csv
#  - out/woo_variantes.csv
#  - out/dragonfish_activar.txt
```

- **SKU variación** = `<sku_padre>##<token>`, donde `token` se obtiene de `config/talles_map.json`.  
  Si no hay mapeo, se usa la parte izquierda del talle (`"30/40" → "30"`).

- **Superior** = `id:<ID_padre>` (enlaza cada variación con su padre).

---

## 🔧 Configuración (archivos `config/`)

### `tipificaciones_codigos.json`
Traduce **códigos DF → nombres** (Proveedor, Familia, Categoría, Clasificación, Tipo, Curva).
- Si agregás **nuevos códigos**, sumalos acá.

### `correspondencias.json`
- `categoria_map`: mapea **Categoría DF + Género** → **ruta de Woo** (ej.: `JEAN → HOMBRE: "HOMBRE, HOMBRE > JEANS"`).
- `etiquetas_base_por_categoria`: etiquetas iniciales por categoría DF.
- `clasificacion_tags_map` / `tipo_tags_map`: etiquetas extra por clasificación/tipo.
- `curva_talles_map`: **lista** de talles por **curva** (se usa para el **padre**).
- `dimensiones_por_categoria`: peso/largo/ancho/alto por categoría DF.

> Podés agregar más categorías/géneros. Si no existe la combinación, se arma una ruta **fallback**:  
> `GÉNERO, GÉNERO > Categoria` (con capitalización básica).

### `talles_map.json`
Convierte el **talle visible** en el **token** para el SKU de variación:
```json
{ "30/40": "30", "S": "S", "UNICO": "UNICO" }
```

### `headers_woo.json`
Encabezados exactos del CSV de Woo en español. **No es necesario editarlo**.

---

## 🧩 Ejemplo (real)

**Maestro**:
```
Código         Descripción                        Prov Fam Curva Cat Clasif Tipo
THJ00406207    JEAN RUNDEN T-BAJO SKINNY          01   01  01    01  12     07
```

**Traducción**:
- Proveedor `01` → **Taverniti**
- Familia `01` → **HOMBRE**
- Curva `01` → **JEAN HOMBRE (26 - 70)** → talles padre: `28/38, 30/40, ...`
- Categoría `01` → **JEAN** → ruta Woo (Hombre): `HOMBRE, HOMBRE > JEANS`
- Clasificación `12` → **CHUPIN / SKINNY** → etiqueta `Skinny`
- Tipo `07` → **TIRO BAJO** → etiqueta `Tiro bajo`

**Padre generado (extracto)**:
- Tipo `variable`, Publicado `1`, Destacado `1`, Visible `visible`, Impuesto `taxable`
- Marcas: `Taverniti`
- Categorías: `HOMBRE, HOMBRE > JEANS`
- Etiquetas: `Denim, Jean, Pantalon, Pantalones, Taverniti, Hombre, Skinny, Tiro bajo`
- Atributo 1 (Talle): `28/38, 30/40, 32/42, 34/44, 36/46, 38/48, 40/50`
- Atributo 2 (Marca): `Taverniti`
- Dimensiones (JEAN): `0.60 / 20 / 20 / 10`

**Variaciones** (tras export Woo con IDs):
- SKU `THJ00406207##28`, `THJ00406207##30`, …
- Nombre `JEAN RUNDEN T-BAJO SKINNY - 30/40`
- Superior `id:<ID_padre>`
- TXT Dragonfish con todos los SKUs de variación, uno por línea.

---

## 🧯 Troubleshooting (logs y soluciones)

- `logs/no_encontrados.txt` → El **SKU** de `entrada_padres.xlsx` no aparece en el maestro.  
  **Solución:** revisar (o normalizar) códigos en el maestro.

- `logs/codigos_desconocidos.txt` → Código DF sin mapeo en `tipificaciones_codigos.json`.  
  **Solución:** agregar el código.

- `logs/categorias_sin_mapa.txt` → Categoría no tiene ruta en `categoria_map`.  
  **Solución:** agregar la ruta o dejar que se arme la ruta fallback.

- `logs/curvas_sin_talles.txt` → Falta lista de talles en `curva_talles_map`.  
  **Solución:** completar la curva correspondiente.

- `logs/padres_sin_id.txt` (solo en variaciones) → El SKU del padre no figura en el export de Woo.  
  **Solución:** verificar que el padre se importó y que Woo lo exportó con `ID` y `SKU`.

---

## 💡 Consejos para Woo

- **UTF-8**: los CSV generados ya salen en UTF-8 con comillas.
- **Decimales**: usar **punto** (.) como separador decimal.
- **Atributos globales**: si vas a usar `Atributo global = 1`, asegurate de tener dados de alta **Talle** y **Marca** en Woo.
- **Imágenes**: podés sumar URLs en la columna `Imágenes` (separadas por coma) si ya las tenés subidas y públicas.
- **Stock**: este flujo asume que el stock lo maneja Dragonfish por **SKU de variación**.

---

## 🔌 Extensiones

- Añadir **precios** (`Precio normal` / `Precio rebajado`).
- Añadir **descripciones** desde otro origen.
- Añadir **más atributos** (color, fit, tela) con nuevas columnas `Nombre del atributo 3`, etc.
- Reglas específicas por marca/familia/categoría (e.g., dimensiones distintas).

---

## 📝 Scripts (CLI)

### Generar padres con rutas personalizadas
```bash
node src/steps/01_generar_padres.js   data/entrada_padres.xlsx   data/maestro_dragonfish.xlsx   out/woo_padres.csv
```

### Generar variaciones con archivos custom
```bash
node src/steps/04_generar_variantes.js   data/entrada_padres.xlsx   data/maestro_dragonfish.xlsx   data/export_woo_padres.csv   out/woo_variantes.csv   out/dragonfish_activar.txt
```

---

## 📦 Versionado

- **v0.1.0**: Primera versión opérativa (padres + variaciones + TXT), reglas base de correspondencias y ejemplos.

---

¿Sugerencias o cambios que quieras fijar por defecto (etiquetas, rutas de categorías, curvas, etc.)? Abrimos `config/correspondencias.json` y lo ajustamos.
#   D r a g o n - - - W o o 
 
 

## Extensión: Colores por SKU padre + Fallback cuando el base no está en el maestro

- Si el maestro **no** tiene el `sku_base` (p. ej. `tvhr09234`), pero **sí** tiene los SKUs con color (p. ej. `tvhr09234600`, `tvhr09234601`), el generador de padres:
  - Busca esas filas por **colores declarados** en `data/var_colores.csv` (preferido).
  - Si no hay archivo, detecta SKUs que empiezan con el `sku_base` y tienen **sufijo numérico de 3 dígitos** (ej. `600`).
  - Con esas coincidencias arma un **perfil sintético** del maestro (proveedor/familia/categoría/clasificación/tipo/curva) por **mayoría**.
  - Además, si faltan colores en archivo, **deriva** la lista de colores desde los sufijos detectados (nombres = código).

- El resto del flujo no cambia:
  1. `npm run gen:padres` → `out/woo_padres.csv`
  2. Importar en Woo y exportar CSV con IDs → `data/export_woo_padres.csv`
  3. `npm run gen:variantes` → `out/woo_variantes.csv` y `out/dragonfish_activar.txt`

