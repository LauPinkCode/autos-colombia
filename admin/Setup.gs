/**
 * Instalación, datos semilla y menú administrativo de la hoja de cálculo.
 * El CRUD completo de usuarios/celdas llega en la iteración 2; mientras tanto el
 * propietario gestiona empleados desde el menú "Autos Colombia" de la hoja.
 */

/** Credenciales iniciales: cámbielas desde el menú apenas termine la instalación. */
const SEMILLA_EMPLEADOS = [
  { rol: 'ADMINISTRADOR', nombres: 'Admin', apellidos: 'Principal', documento: '1000000001', username: 'admin', password: 'Admin2026*' },
  { rol: 'OPERADOR', nombres: 'Operador', apellidos: 'Portería', documento: '1000000002', username: 'operador', password: 'Operador2026*' }
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Autos Colombia')
    .addItem('Instalar / reparar estructura', 'setup')
    .addSeparator()
    .addItem('Crear empleado', 'menuCrearEmpleado')
    .addItem('Restablecer contraseña', 'menuRestablecerPassword')
    .addItem('Activar / desactivar empleado', 'menuCambiarEstadoEmpleado')
    .addSeparator()
    .addItem('Crear respaldo ahora', 'crearRespaldo')
    .addItem('Ejecutar pruebas automáticas', 'runTests')
    .addToUi();
}

/** Ejecutar una vez desde el editor (o el menú). Es idempotente. */
function setup() {
  soloPropietario_();
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('Autos Colombia - Base de datos');
  ss.setSpreadsheetTimeZone(CONFIG.TZ);
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  Db.usar(ss);

  crearEstructura_(ss);
  sembrarDatos_(true);
  secretoJwt_();
  instalarRespaldoDiario_();

  const msg = 'Instalación completa en: ' + ss.getUrl() +
    '\nUsuarios iniciales: ' + SEMILLA_EMPLEADOS.map(e => e.username).join(', ') +
    ' (contraseñas en Setup.gs → cámbielas desde el menú).';
  console.log(msg);
  return msg;
}

function crearEstructura_(ss) {
  Object.keys(TABLAS).forEach(tabla => {
    const cols = TABLAS[tabla];
    let sh = ss.getSheetByName(tabla);
    if (!sh) sh = ss.insertSheet(tabla);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#1e4fa3').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    const formatos = FORMATOS_FECHA[tabla] || {};
    Object.keys(formatos).forEach(col => {
      sh.getRange(2, cols.indexOf(col) + 1, sh.getMaxRows() - 1, 1).setNumberFormat(formatos[col]);
    });
  });
  ['Hoja 1', 'Hoja1', 'Sheet1'].forEach(nombre => {
    const sh = ss.getSheetByName(nombre);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  SpreadsheetApp.flush();
}

function sembrarDatos_(conDemo) {
  if (!Db.todos('rol').length) {
    Db.insertar('rol', { nombre: ROLES.ADMIN });
    Db.insertar('rol', { nombre: ROLES.OPERADOR });
  }
  if (!Db.todos('empleado').length) {
    SEMILLA_EMPLEADOS.forEach(e => crearEmpleado_(e.rol, e.nombres, e.apellidos, e.documento, e.username, e.password));
  }
  if (conDemo && !Db.todos('cliente').length) sembrarDemo_();
}

/** Datos de demostración para probar todos los flujos de la iteración 1. */
function sembrarDemo_() {
  const hoy = hoyStr_();
  const dia = n => fechaLocal_(sumarDias_(hoy, n));

  const celdas = {};
  ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07', 'A-08'].forEach(c =>
    celdas[c] = Db.insertar('celda', { codigo: c, tipo_vehiculo: 'CARRO', zona: 'Zona A', estado: c === 'A-05' ? 'MANTENIMIENTO' : 'LIBRE' }));
  ['M-01', 'M-02', 'M-03', 'M-04'].forEach(c =>
    celdas[c] = Db.insertar('celda', { codigo: c, tipo_vehiculo: 'MOTO', zona: 'Zona M', estado: 'LIBRE' }));

  const clientes = [
    ['CC', '71234567', 'Carlos', 'Restrepo', '3001234567'],
    ['CC', '43123456', 'María', 'Gómez', '3109876543'],
    ['CC', '98765432', 'Andrés', 'Zapata', '3205551234'],
    ['CE', 'E123456', 'Laura', 'Pérez', '3014445566'],
    ['CC', '10203040', 'Jorge', 'Vélez', '3127778899']
  ].map(c => Db.insertar('cliente', {
    tipo_documento: c[0], numero_documento: c[1], nombres: c[2], apellidos: c[3], telefono: c[4],
    correo: '', direccion: '', estado: 'ACTIVO', fecha_registro: new Date()
  }));

  // placa, tipo, marca, color, cliente, celda, inicio, fin, estado  → caso que demuestra
  [
    ['ABC123', 'CARRO', 'Mazda', 'Rojo', 0, 'A-01', -10, 20, 'ACTIVA'],     // vigente
    ['XYZ789', 'CARRO', 'Renault', 'Gris', 1, 'A-02', -27, 3, 'ACTIVA'],    // alerta: vence en 3 días
    ['OLD999', 'CARRO', 'Chevrolet', 'Blanco', 2, 'A-03', -40, -10, 'ACTIVA'], // vencida por fecha
    ['CAN111', 'CARRO', 'Kia', 'Negro', 2, 'A-04', -5, 25, 'CANCELADA'],    // cancelada
    ['DEF456', 'CARRO', 'Toyota', 'Azul', 3, 'A-05', -2, 28, 'ACTIVA'],     // celda en mantenimiento
    ['MOT45E', 'MOTO', 'Yamaha', 'Negro', 4, 'M-01', -15, 15, 'ACTIVA'],    // moto vigente
    ['SIN000', 'CARRO', 'Ford', 'Verde', 4, null, 0, 0, null]               // sin mensualidad
  ].forEach(d => {
    const v = Db.insertar('vehiculo', { placa: d[0], tipo_vehiculo: d[1], marca: d[2], color: d[3], id_cliente: clientes[d[4]].id_cliente });
    if (!d[5]) return;
    Db.insertar('mensualidad', {
      id_cliente: clientes[d[4]].id_cliente, id_vehiculo: v.id_vehiculo, id_celda: celdas[d[5]].id_celda,
      fecha_inicio: dia(d[6]), fecha_fin: dia(d[7]), valor: d[1] === 'MOTO' ? 70000 : 150000, estado: d[8]
    });
  });
}

function crearEmpleado_(rolNombre, nombres, apellidos, documento, username, password) {
  const rol = Db.buscarUno('rol', r => r.nombre === rolNombre);
  if (!rol) throw new Error('Rol inválido: ' + rolNombre);
  username = texto_(username, 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('Usuario inválido (3-40 caracteres: letras, números, . _ -)');
  if (Db.buscarUno('empleado', e => String(e.username).toLowerCase() === username)) throw new Error('El usuario ya existe');
  if (Db.buscarUno('empleado', e => String(e.documento) === String(documento))) throw new Error('El documento ya está registrado');
  validarPassword_(password);
  return Db.insertar('empleado', {
    id_rol: rol.id_rol, nombres: texto_(nombres, 80), apellidos: texto_(apellidos, 80), documento: texto_(documento, 20),
    username, password_hash: AuthService.hashPassword(password), activo: true
  });
}

function validarPassword_(p) {
  if (!p || p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) {
    throw new Error('La contraseña debe tener mínimo 8 caracteres, con letras y números');
  }
}

/* ---------- Menú de la hoja (solo propietario) ---------- */

function preguntar_(ui, titulo, texto) {
  const r = ui.prompt(titulo, texto, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) throw new Error('Operación cancelada');
  return r.getResponseText().trim();
}

function menuCrearEmpleado() {
  soloPropietario_();
  const ui = SpreadsheetApp.getUi();
  try {
    const rol = preguntar_(ui, 'Crear empleado', 'Rol (ADMINISTRADOR u OPERADOR):').toUpperCase();
    const nombres = preguntar_(ui, 'Crear empleado', 'Nombres:');
    const apellidos = preguntar_(ui, 'Crear empleado', 'Apellidos:');
    const documento = preguntar_(ui, 'Crear empleado', 'Número de documento:');
    const username = preguntar_(ui, 'Crear empleado', 'Usuario para iniciar sesión:');
    const password = preguntar_(ui, 'Crear empleado', 'Contraseña (mín. 8, letras y números):');
    const e = crearEmpleado_(rol, nombres, apellidos, documento, username, password);
    ui.alert('Empleado creado: ' + e.username);
  } catch (err) {
    ui.alert(err.message);
  }
}

function menuRestablecerPassword() {
  soloPropietario_();
  const ui = SpreadsheetApp.getUi();
  try {
    const username = preguntar_(ui, 'Restablecer contraseña', 'Usuario:').toLowerCase();
    const emp = Db.buscarUno('empleado', e => String(e.username).toLowerCase() === username);
    if (!emp) throw new Error('No existe el usuario ' + username);
    const password = preguntar_(ui, 'Restablecer contraseña', 'Nueva contraseña (mín. 8, letras y números):');
    validarPassword_(password);
    Db.actualizar('empleado', emp.id_empleado, { password_hash: AuthService.hashPassword(password) });
    CacheService.getScriptCache().remove('login_fail_' + username);
    ui.alert('Contraseña actualizada para ' + username);
  } catch (err) {
    ui.alert(err.message);
  }
}

function menuCambiarEstadoEmpleado() {
  soloPropietario_();
  const ui = SpreadsheetApp.getUi();
  try {
    const username = preguntar_(ui, 'Activar / desactivar', 'Usuario:').toLowerCase();
    const emp = Db.buscarUno('empleado', e => String(e.username).toLowerCase() === username);
    if (!emp) throw new Error('No existe el usuario ' + username);
    const activo = !esVerdadero_(emp.activo);
    Db.actualizar('empleado', emp.id_empleado, { activo });
    ui.alert(username + ' ahora está ' + (activo ? 'ACTIVO' : 'INACTIVO'));
  } catch (err) {
    ui.alert(err.message);
  }
}
