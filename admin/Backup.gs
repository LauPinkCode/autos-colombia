/**
 * RNF-07: respaldo diario automático de la base de datos con retención de 30 días.
 * Copia la hoja de cálculo completa a una carpeta de Google Drive.
 */

function crearRespaldo() {
  soloPropietario_();
  return respaldar_();
}

/** Lo invoca el disparador diario. Solo acepta eventos de un disparador real del proyecto. */
function respaldoAutomatico(e) {
  const uid = e && e.triggerUid;
  if (!uid || !ScriptApp.getProjectTriggers().some(t => t.getUniqueId() === String(uid))) {
    throw new Error('Solo se ejecuta desde el disparador programado');
  }
  respaldar_();
}

function respaldar_() {
  const ss = Db.spreadsheet();
  const carpeta = carpetaRespaldos_();
  const nombre = 'Respaldo ' + ss.getName() + ' ' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HHmm');
  DriveApp.getFileById(ss.getId()).makeCopy(nombre, carpeta);

  const limite = Date.now() - CONFIG.BACKUP_RETENCION_DIAS * 86400000;
  const archivos = carpeta.getFiles();
  let eliminados = 0;
  while (archivos.hasNext()) {
    const f = archivos.next();
    if (f.getName().indexOf('Respaldo ') === 0 && f.getDateCreated().getTime() < limite) {
      f.setTrashed(true);
      eliminados++;
    }
  }
  const msg = 'Respaldo creado: ' + nombre + (eliminados ? ' · ' + eliminados + ' respaldo(s) antiguos enviados a la papelera' : '');
  console.log(msg);
  return msg;
}

function carpetaRespaldos_() {
  const it = DriveApp.getFoldersByName(CONFIG.BACKUP_CARPETA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.BACKUP_CARPETA);
}

function instalarRespaldoDiario_() {
  const existe = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'respaldoAutomatico');
  if (!existe) {
    ScriptApp.newTrigger('respaldoAutomatico').timeBased().everyDays(1).atHour(2).inTimezone(CONFIG.TZ).create();
  }
}
