/**
 * Utilidades compartidas: errores de negocio, fechas en America/Bogota, placas y bloqueo.
 */

class ErrorNegocio extends Error {
  /** @param {number} codigo Código estilo HTTP (400, 401, 403, 404, 409). */
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.codigo = codigo;
  }
}

/** RN-07: la placa se almacena en mayúsculas, sin espacios (ni guiones). */
function normalizarPlaca_(placa) {
  return String(placa == null ? '' : placa).toUpperCase().replace(/[\s-]+/g, '');
}

function esPlacaValida_(placa) {
  return /^[A-Z0-9]{3,10}$/.test(placa);
}

function esFecha_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function esVerdadero_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

/** Fecha de hoy (America/Bogota) como 'yyyy-MM-dd'. */
function hoyStr_() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
}

/** Convierte un valor de la hoja (Date o texto) a 'yyyy-MM-dd'. */
function fechaStr_(v) {
  if (esFecha_(v)) return Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd');
  return v ? String(v).substring(0, 10) : '';
}

function fechaHoraStr_(v) {
  return esFecha_(v) ? Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd HH:mm') : '';
}

function isoStr_(v) {
  return esFecha_(v) ? v.toISOString() : '';
}

/** 'yyyy-MM-dd' → Date al inicio (o fin) de ese día en Bogotá (UTC-5, sin horario de verano). */
function fechaLocal_(str, finDelDia) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str))) throw new ErrorNegocio(400, 'Fecha inválida: ' + str);
  return new Date(str + (finDelDia ? 'T23:59:59.999' : 'T00:00:00.000') + '-05:00');
}

function sumarDias_(str, dias) {
  return Utilities.formatDate(new Date(fechaLocal_(str).getTime() + dias * 86400000 + 12 * 3600000), CONFIG.TZ, 'yyyy-MM-dd');
}

/** Último día del periodo mensual que empieza en 'yyyy-MM-dd' (un mes calendario menos un día). */
function finDeMes_(inicioStr) {
  const [y, m, d] = inicioStr.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();       // días del mes siguiente
  if (d > ultimoDia) return new Date(Date.UTC(y, m, ultimoDia)).toISOString().slice(0, 10);   // p. ej. 31 ene → 28 feb
  const siguiente = new Date(Date.UTC(y, m, d));                          // mismo día del mes siguiente
  return new Date(siguiente.getTime() - 86400000).toISOString().slice(0, 10);
}

/** Texto obligatorio: lo recorta y lanza 400 si queda vacío o supera el máximo. */
function requerido_(valor, nombre, max) {
  const s = texto_(valor);
  if (!s) throw new ErrorNegocio(400, 'El campo ' + nombre + ' es obligatorio');
  if (max && s.length > max) throw new ErrorNegocio(400, 'El campo ' + nombre + ' admite máximo ' + max + ' caracteres');
  return s;
}

/** Valor que debe pertenecer a una lista cerrada (equivalente a un CHECK). */
function opcion_(valor, lista, nombre) {
  const s = texto_(valor).toUpperCase();
  if (lista.indexOf(s) < 0) throw new ErrorNegocio(400, nombre + ' inválido: use ' + lista.join(', '));
  return s;
}

function diasEntre_(desdeStr, hastaStr) {
  return Math.round((Date.parse(hastaStr + 'T00:00:00Z') - Date.parse(desdeStr + 'T00:00:00Z')) / 86400000);
}

function minutosEntre_(inicio, fin) {
  return Math.max(0, Math.floor((fin.getTime() - inicio.getTime()) / 60000));
}

function duracionTexto_(minutos) {
  if (minutos == null || minutos === '') return '';
  const d = Math.floor(minutos / 1440);
  const h = Math.floor((minutos % 1440) / 60);
  const m = minutos % 60;
  return (d ? d + ' d ' : '') + (d || h ? h + ' h ' : '') + m + ' min';
}

function texto_(v, max) {
  const s = String(v == null ? '' : v).trim();
  return max ? s.substring(0, max) : s;
}

/**
 * Ejecuta fn con bloqueo exclusivo del script. Evita condiciones de carrera entre
 * operadores simultáneos (RN-03: nunca dos entradas abiertas para el mismo vehículo).
 */
function conBloqueo_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new ErrorNegocio(409, 'El sistema está ocupado, intente de nuevo.');
  try {
    Db.limpiarCache();
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

/** Las utilidades administrativas solo las puede ejecutar el propietario (editor / menú de la hoja). */
function soloPropietario_() {
  const activo = Session.getActiveUser().getEmail();
  const efectivo = Session.getEffectiveUser().getEmail();
  if (!activo || activo !== efectivo) {
    throw new Error('Solo el propietario del proyecto puede ejecutar esta función desde el editor o la hoja de cálculo.');
  }
}
