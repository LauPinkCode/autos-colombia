/**
 * Capa API / controladores. Son las únicas funciones que el navegador invoca
 * (google.script.run). Cada una valida el token y el rol antes de llamar al servicio,
 * y devuelve siempre { ok: true, data } o { ok: false, codigo, mensaje }.
 *
 * Funciones expuestas:
 *   apiLogin, apiSesion                        → HU-01
 *   apiConsultarEntrada, apiRegistrarEntrada   → HU-02, HU-03
 *   apiConsultarSalida, apiRegistrarSalida     → HU-04
 *   apiPanel                                   → HU-05, HU-06
 *   apiHistorial                               → HU-07 (Administrador)
 *   apiReporte                                 → HU-08 (Administrador)
 *   apiClientes, apiCliente, apiGuardarCliente, apiGuardarVehiculo → Iteración 2 (Administrador)
 *   apiCeldas, apiGuardarCelda                 → Iteración 2 (Administrador)
 *   apiEmpleados, apiGuardarEmpleado, apiRestablecerPassword → Iteración 2 (Administrador)
 *   apiRegistrarNovedad, apiNovedades          → Iteración 2 (ambos roles)
 *   apiConsultarPago, apiRegistrarPago, apiCartera, apiPagos → Iteración 3 (Administrador)
 */

function doGet() {
  return HtmlService.createTemplateFromFile('vistas/Index')
    .evaluate()
    .setTitle('Autos Colombia – Parqueadero')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

function ejecutar_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, codigo: e.codigo, mensaje: e.message };
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, codigo: 500, mensaje: 'Error interno del sistema. Intente de nuevo.' };
  }
}

function conSesion_(token, rolesPermitidos, fn) {
  return ejecutar_(() => {
    const emp = AuthService.verificar(token);
    if (rolesPermitidos && rolesPermitidos.indexOf(emp.rol) < 0) {
      throw new ErrorNegocio(403, 'No tiene permisos para esta función');
    }
    return fn(emp);
  });
}

/* ---------- HU-01 ---------- */
function apiLogin(username, password) {
  return ejecutar_(() => AuthService.login(username, password));
}

function apiSesion(token) {
  return conSesion_(token, null, emp => emp);
}

/* ---------- HU-02 / HU-03 ---------- */
function apiConsultarEntrada(token, placa) {
  return conSesion_(token, null, () => AccesoService.consultarEntrada(placa));
}

function apiRegistrarEntrada(token, placa, observaciones) {
  return conSesion_(token, null, emp => AccesoService.registrarEntrada(placa, emp, observaciones));
}

/* ---------- HU-04 ---------- */
function apiConsultarSalida(token, placa) {
  return conSesion_(token, null, () => AccesoService.consultarSalida(placa));
}

function apiRegistrarSalida(token, placa, observaciones) {
  return conSesion_(token, null, emp => AccesoService.registrarSalida(placa, emp, observaciones));
}

/* ---------- HU-05 / HU-06 ---------- */
function apiPanel(token) {
  return conSesion_(token, null, () => ({
    resumen: CeldaService.resumen(),
    celdas: CeldaService.mapa(),
    activos: AccesoService.listarActivos(),
    generado: new Date().toISOString()
  }));
}

/* ---------- HU-07 / HU-08 (solo Administrador) ---------- */
function apiHistorial(token, filtros) {
  return conSesion_(token, [ROLES.ADMIN], () => ReporteService.historial(filtros));
}

function apiReporte(token, desde, hasta) {
  return conSesion_(token, [ROLES.ADMIN], () => ReporteService.movimientos(desde, hasta));
}

/* ---------- Iteración 2: clientes y vehículos (solo Administrador) ---------- */
function apiClientes(token, busqueda) {
  return conSesion_(token, [ROLES.ADMIN], () => ClienteService.listar(busqueda));
}

function apiCliente(token, idCliente) {
  return conSesion_(token, [ROLES.ADMIN], () => ClienteService.detalle(idCliente));
}

function apiGuardarCliente(token, datos) {
  return conSesion_(token, [ROLES.ADMIN], () => ClienteService.guardar(datos));
}

function apiGuardarVehiculo(token, datos) {
  return conSesion_(token, [ROLES.ADMIN], () => ClienteService.guardarVehiculo(datos));
}

/* ---------- Iteración 2: celdas (solo Administrador) ---------- */
function apiCeldas(token) {
  return conSesion_(token, [ROLES.ADMIN], () => CeldaService.listarAdmin());
}

function apiGuardarCelda(token, datos) {
  return conSesion_(token, [ROLES.ADMIN], () => CeldaService.guardar(datos));
}

/* ---------- Iteración 2: empleados (solo Administrador) ---------- */
function apiEmpleados(token) {
  return conSesion_(token, [ROLES.ADMIN], () => EmpleadoService.listar());
}

function apiGuardarEmpleado(token, datos) {
  return conSesion_(token, [ROLES.ADMIN], emp => EmpleadoService.guardar(datos, emp));
}

function apiRestablecerPassword(token, idEmpleado, password) {
  return conSesion_(token, [ROLES.ADMIN], () => EmpleadoService.restablecerPassword(idEmpleado, password));
}

/* ---------- Iteración 2: novedades (Administrador y Operador) ---------- */
function apiRegistrarNovedad(token, datos) {
  return conSesion_(token, null, emp => NovedadService.registrar(datos, emp));
}

function apiNovedades(token, filtros) {
  return conSesion_(token, null, () => NovedadService.listar(filtros));
}

/* ---------- Iteración 3: pagos (solo Administrador) ---------- */
function apiConsultarPago(token, placa) {
  return conSesion_(token, [ROLES.ADMIN], () => PagoService.consultar(placa));
}

function apiRegistrarPago(token, datos) {
  return conSesion_(token, [ROLES.ADMIN], emp => PagoService.registrar(datos, emp));
}

function apiCartera(token) {
  return conSesion_(token, [ROLES.ADMIN], () => PagoService.cartera());
}

function apiPagos(token, desde, hasta) {
  return conSesion_(token, [ROLES.ADMIN], () => PagoService.historial(desde, hasta));
}
