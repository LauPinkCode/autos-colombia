/**
 * Capa de acceso a datos (repositorio genérico sobre Google Sheets).
 * Cada hoja = una tabla; fila 1 = encabezados; columna A = llave primaria.
 * Los servicios nunca tocan SpreadsheetApp directamente: solo usan Db.
 */
const Db = (() => {
  let ssActual = null;
  let cache = {};

  function spreadsheet() {
    if (ssActual) return ssActual;
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    ssActual = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ssActual) throw new Error('Base de datos no configurada. Ejecute setup() desde el editor.');
    return ssActual;
  }

  function columnas(tabla) {
    const cols = TABLAS[tabla];
    if (!cols) throw new Error('Tabla desconocida: ' + tabla);
    return cols;
  }

  function hoja(tabla) {
    const sh = spreadsheet().getSheetByName(tabla);
    if (!sh) throw new Error('No existe la hoja "' + tabla + '". Ejecute setup().');
    return sh;
  }

  /** Evita que un texto se interprete como fórmula o pierda ceros a la izquierda. */
  function valorCelda(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' && /^([=+\-@]|\d+([.,]\d+)?$)/.test(v)) return "'" + v;
    return v;
  }

  function cargar(tabla) {
    if (cache[tabla]) return cache[tabla];
    const cols = columnas(tabla);
    const sh = hoja(tabla);
    const n = sh.getLastRow() - 1;
    const valores = n > 0 ? sh.getRange(2, 1, n, cols.length).getValues() : [];
    const filas = [];
    const indice = {};
    valores.forEach((f, i) => {
      if (f[0] === '' || f[0] === null) return;
      const r = {};
      cols.forEach((c, j) => { r[c] = f[j]; });
      Object.defineProperty(r, '_fila', { value: i + 2, enumerable: false });
      filas.push(r);
      indice[Number(f[0])] = r;
    });
    cache[tabla] = { filas, indice };
    return cache[tabla];
  }

  return {
    /** Permite apuntar a otra hoja (pruebas automáticas). null = la configurada. */
    usar(ss) { ssActual = ss; cache = {}; },
    spreadsheet,
    limpiarCache() { cache = {}; },

    todos(tabla) { return cargar(tabla).filas; },
    filtrar(tabla, pred) { return cargar(tabla).filas.filter(pred); },
    buscarUno(tabla, pred) { return cargar(tabla).filas.find(pred) || null; },
    porId(tabla, id) {
      if (id === '' || id === null || id === undefined) return null;
      return cargar(tabla).indice[Number(id)] || null;
    },

    insertar(tabla, datos) {
      const cols = columnas(tabla);
      const pk = cols[0];
      const id = cargar(tabla).filas.reduce((max, r) => Math.max(max, Number(r[pk]) || 0), 0) + 1;
      const registro = Object.assign({}, datos, { [pk]: id });
      hoja(tabla).appendRow(cols.map(c => valorCelda(registro[c])));
      delete cache[tabla];
      return registro;
    },

    actualizar(tabla, id, cambios) {
      const actual = this.porId(tabla, id);
      if (!actual) throw new Error('No existe ' + tabla + ' con id ' + id);
      const cols = columnas(tabla);
      const nuevo = Object.assign({}, actual, cambios);
      hoja(tabla).getRange(actual._fila, 1, 1, cols.length).setValues([cols.map(c => valorCelda(nuevo[c]))]);
      delete cache[tabla];
      return nuevo;
    }
  };
})();
