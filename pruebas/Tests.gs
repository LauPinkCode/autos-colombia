/**
 * Pruebas automatizadas del módulo, escritas en JavaScript y ejecutadas en Apps Script.
 * Crean una hoja temporal con datos de demostración, ejecutan los casos y la eliminan.
 * Ejecutar runTests() desde el editor; el resultado queda en el registro de ejecución.
 */

function runTests() {
  soloPropietario_();
  const tmp = SpreadsheetApp.create('TEST Autos Colombia ' + new Date().toISOString());
  tmp.setSpreadsheetTimeZone(CONFIG.TZ);
  const resultados = [];
  try {
    Db.usar(tmp);
    crearEstructura_(tmp);
    sembrarDatos_(true);
    CASOS_PRUEBA_.forEach(([nombre, fn]) => {
      try {
        Db.limpiarCache();
        fn(contextoPrueba_());
        resultados.push('✔ ' + nombre);
      } catch (e) {
        resultados.push('✘ ' + nombre + ' → ' + e.message);
      }
    });
  } finally {
    Db.usar(null);
    DriveApp.getFileById(tmp.getId()).setTrashed(true);
  }
  const fallos = resultados.filter(r => r[0] === '✘').length;
  const resumen = resultados.join('\n') + '\n\n' + (resultados.length - fallos) + ' / ' + resultados.length + ' pruebas OK';
  console.log(resumen);
  try { SpreadsheetApp.getUi().alert(resumen); } catch (e) { /* ejecutado desde el editor */ }
  return resumen;
}

function contextoPrueba_() {
  const emp = id => AuthService.dto_(Db.porId('empleado', id));
  return {
    admin: emp(Db.buscarUno('empleado', e => e.username === 'admin').id_empleado),
    operador: emp(Db.buscarUno('empleado', e => e.username === 'operador').id_empleado)
  };
}

function afirmar_(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'Afirmación fallida');
}

function esperarError_(codigo, fn) {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErrorNegocio && e.codigo === codigo) return e;
    throw new Error('Se esperaba error ' + codigo + ' y se obtuvo: ' + (e.codigo || '') + ' ' + e.message);
  }
  throw new Error('Se esperaba error ' + codigo + ' y no hubo error');
}

function celdaDe_(codigo) {
  Db.limpiarCache();
  return Db.buscarUno('celda', c => c.codigo === codigo);
}

const CASOS_PRUEBA_ = [
  ['HU-02 entrada OK: registro ABIERTO y celda OCUPADA', ctx => {
    const r = AccesoService.registrarEntrada('abc123', ctx.operador);
    afirmar_(r.id_registro > 0, 'sin id de registro');
    Db.limpiarCache();
    afirmar_(Db.porId('registro_acceso', r.id_registro).estado === 'ABIERTO', 'registro no ABIERTO');
    afirmar_(celdaDe_('A-01').estado === 'OCUPADA', 'celda no OCUPADA');
    afirmar_(Number(Db.porId('registro_acceso', r.id_registro).id_empleado_entrada) === ctx.operador.id_empleado, 'sin empleado (RN-06)');
  }],
  ['RN-03 entrada duplicada → 409', ctx => {
    const e = esperarError_(409, () => AccesoService.registrarEntrada('ABC123', ctx.operador));
    afirmar_(e.message === 'El vehículo ya se encuentra en el parqueadero', e.message);
  }],
  ['RN-07 placa con espacios/minúsculas se normaliza', () => {
    esperarError_(409, () => AccesoService.consultarEntrada(' abc 123 '));
  }],
  ['HU-02 CA2 placa no registrada → 404', ctx => {
    const e = esperarError_(404, () => AccesoService.registrarEntrada('NOX000', ctx.operador));
    afirmar_(e.message === 'Vehículo no registrado', e.message);
  }],
  ['RN-01 mensualidad vencida → 403', ctx => {
    esperarError_(403, () => AccesoService.registrarEntrada('OLD999', ctx.operador));
    const f = AccesoService.consultarEntrada('OLD999');
    afirmar_(!f.puede_ingresar && /vencida/.test(f.motivo), 'motivo: ' + f.motivo);
  }],
  ['HU-03 CA2 mensualidad cancelada / inexistente → bloqueada con motivo', () => {
    afirmar_(/CANCELADA/.test(AccesoService.consultarEntrada('CAN111').motivo), 'cancelada');
    afirmar_(/no tiene mensualidad/.test(AccesoService.consultarEntrada('SIN000').motivo), 'sin mensualidad');
  }],
  ['HU-03 CA3 alerta si faltan ≤ 5 días', () => {
    const f = AccesoService.consultarEntrada('XYZ789');
    afirmar_(f.puede_ingresar && f.alerta && f.mensualidad.dias_restantes === 3, JSON.stringify(f));
    afirmar_(!AccesoService.consultarEntrada('MOT45E').alerta, 'no debería alertar');
  }],
  ['CU-02 A4 celda en mantenimiento → 409', ctx => {
    esperarError_(409, () => AccesoService.registrarEntrada('DEF456', ctx.operador));
  }],
  ['HU-04 salida libera celda y cierra registro', ctx => {
    const r = AccesoService.registrarSalida('ABC123', ctx.admin);
    Db.limpiarCache();
    const reg = Db.porId('registro_acceso', r.id_registro);
    afirmar_(reg.estado === 'CERRADO', 'no CERRADO');
    afirmar_(esFecha_(reg.fecha_hora_salida), 'sin fecha de salida');
    afirmar_(Number(reg.id_empleado_salida) === ctx.admin.id_empleado, 'sin empleado de salida');
    afirmar_(celdaDe_('A-01').estado === 'LIBRE', 'celda no LIBRE');
  }],
  ['RN-04 salida sin entrada → 409', ctx => {
    const e = esperarError_(409, () => AccesoService.registrarSalida('ABC123', ctx.operador));
    afirmar_(e.message === 'El vehículo no tiene una entrada registrada', e.message);
  }],
  ['HU-05 listado de activos', ctx => {
    AccesoService.registrarEntrada('MOT45E', ctx.operador);
    const activos = AccesoService.listarActivos();
    afirmar_(activos.length === 1 && activos[0].placa === 'MOT45E' && activos[0].celda === 'M-01', JSON.stringify(activos));
    AccesoService.registrarSalida('MOT45E', ctx.operador);
    afirmar_(AccesoService.listarActivos().length === 0, 'HU-05 CA3: el vehículo que sale desaparece');
  }],
  ['HU-06 resumen coincide con las celdas', ctx => {
    AccesoService.registrarEntrada('XYZ789', ctx.operador);
    const r = CeldaService.resumen();
    afirmar_(r.total === 12 && r.ocupadas === 1 && r.mantenimiento === 1 && r.libres === 10, JSON.stringify(r));
    afirmar_(r.entradas_hoy === 3 && r.salidas_hoy === 2, JSON.stringify(r));
  }],
  ['HU-06 mapa de celdas muestra la placa en la celda ocupada', () => {
    const mapa = CeldaService.mapa();
    const a02 = mapa.find(c => c.codigo === 'A-02');
    afirmar_(mapa.length === 12 && a02.estado === 'OCUPADA' && a02.placa === 'XYZ789', JSON.stringify(a02));
    afirmar_(mapa.find(c => c.codigo === 'A-05').estado === 'MANTENIMIENTO', 'A-05 debería estar en mantenimiento');
    afirmar_(mapa.find(c => c.codigo === 'A-01').placa === '', 'A-01 debería estar libre');
  }],
  ['HU-07 historial con filtros', () => {
    const hoy = hoyStr_();
    const todo = ReporteService.historial({ desde: hoy, hasta: hoy });
    afirmar_(todo.total === 3, 'total ' + todo.total);
    const abiertos = ReporteService.historial({ desde: hoy, hasta: hoy, estado: 'ABIERTO' });
    afirmar_(abiertos.total === 1 && abiertos.filas[0].placa === 'XYZ789', JSON.stringify(abiertos));
    const porPlaca = ReporteService.historial({ desde: hoy, hasta: hoy, placa: 'abc' });
    afirmar_(porPlaca.total === 1 && porPlaca.filas[0].empleado_salida === 'Admin Principal', JSON.stringify(porPlaca));
    esperarError_(400, () => ReporteService.historial({ desde: hoy, hasta: sumarDias_(hoy, -1) }));
  }],
  ['HU-08 reporte por día', () => {
    const hoy = hoyStr_();
    const r = ReporteService.movimientos(sumarDias_(hoy, -2), hoy);
    afirmar_(r.dias.length === 3 && r.total_entradas === 3 && r.total_salidas === 2, JSON.stringify(r));
  }],
  ['HU-01 login: OK, credenciales inválidas, inactivo', () => {
    const ok = AuthService.login('admin', SEMILLA_EMPLEADOS[0].password);
    afirmar_(ok.token && ok.empleado.rol === ROLES.ADMIN, 'login admin');
    afirmar_(AuthService.verificar(ok.token).username === 'admin', 'token no verifica');
    const e = esperarError_(401, () => AuthService.login('admin', 'clave-mala'));
    afirmar_(e.message === 'Usuario o contraseña incorrectos', 'CA2: mensaje genérico');
    esperarError_(401, () => AuthService.login('no-existe', 'x'));
    CacheService.getScriptCache().removeAll(['login_fail_admin', 'login_fail_no-existe']);

    crearEmpleado_(ROLES.OPERADOR, 'Ina', 'Activo', '999', 'inactivo', 'Inactivo2026');
    const ina = Db.buscarUno('empleado', x => x.username === 'inactivo');
    Db.actualizar('empleado', ina.id_empleado, { activo: false });
    esperarError_(403, () => AuthService.login('inactivo', 'Inactivo2026'));
  }],
  ['RNF-02 contraseñas cifradas y token alterado/expirado rechazado', () => {
    Db.todos('empleado').forEach(e => afirmar_(/^h1\$/.test(e.password_hash), 'contraseña sin hash: ' + e.username));
    const { token } = AuthService.login('operador', SEMILLA_EMPLEADOS[1].password);
    const partes = token.split('.');
    const alterado = partes[0] + '.' + b64url_(JSON.stringify({ sub: 1, exp: 9999999999 })) + '.' + partes[2];
    esperarError_(401, () => AuthService.verificar(alterado));
    const expirado = firmarJwt_({ sub: 1, iat: 0, exp: Math.floor(Date.now() / 1000) - 1 });
    esperarError_(401, () => AuthService.verificar(expirado));
  }],
  ['RF-11 / HU-08 CA2 operador no accede al reporte', () => {
    const { token } = AuthService.login('operador', SEMILLA_EMPLEADOS[1].password);
    const hoy = hoyStr_();
    const r = apiReporte(token, hoy, hoy);
    afirmar_(!r.ok && r.codigo === 403, JSON.stringify(r));
    const admin = AuthService.login('admin', SEMILLA_EMPLEADOS[0].password).token;
    afirmar_(apiReporte(admin, hoy, hoy).ok, 'admin debería acceder');
  }],

  /* ---------- Iteración 2: clientes, celdas, empleados y novedades ---------- */
  ['IT2 clientes: crear, documento duplicado y placa repetida', () => {
    const d = ClienteService.guardar({ tipo_documento: 'CC', numero_documento: '11223344', nombres: 'Sofía', apellidos: 'Arango', telefono: '3001112233', correo: 'sofia@correo.co' });
    afirmar_(d.cliente.id_cliente > 0 && d.vehiculos.length === 0, JSON.stringify(d));
    esperarError_(409, () => ClienteService.guardar({ tipo_documento: 'CC', numero_documento: '11223344', nombres: 'Otra', apellidos: 'Persona' }));
    esperarError_(400, () => ClienteService.guardar({ tipo_documento: 'XX', numero_documento: '123', nombres: 'A', apellidos: 'B' }));
    const conCarro = ClienteService.guardarVehiculo({ id_cliente: d.cliente.id_cliente, placa: ' new-001 ', tipo_vehiculo: 'CARRO', marca: 'Kia' });
    afirmar_(conCarro.vehiculos.length === 1 && conCarro.vehiculos[0].placa === 'NEW001' &&
      conCarro.vehiculos[0].mensualidad.estado === 'SIN MENSUALIDAD', JSON.stringify(conCarro.vehiculos));
    esperarError_(409, () => ClienteService.guardarVehiculo({ id_cliente: d.cliente.id_cliente, placa: 'ABC123', tipo_vehiculo: 'CARRO' }));
    afirmar_(ClienteService.listar('sofía').length === 1 && ClienteService.listar('new001').length === 1, 'búsqueda de clientes');
  }],
  ['IT2 cliente INACTIVO no puede ingresar', ctx => {
    const c = Db.buscarUno('cliente', x => String(x.numero_documento) === '10203040');   // dueño de MOT45E
    const base = ClienteService.detalle(c.id_cliente).cliente;
    ClienteService.guardar(Object.assign({}, base, { estado: 'INACTIVO' }));
    esperarError_(403, () => AccesoService.registrarEntrada('MOT45E', ctx.operador));
    ClienteService.guardar(Object.assign({}, base, { estado: 'ACTIVO' }));
    afirmar_(AccesoService.consultarEntrada('MOT45E').puede_ingresar, 'debería poder ingresar otra vez');
  }],
  ['IT2 celdas: crear, código duplicado y reglas de estado', () => {
    const lista = CeldaService.guardar({ codigo: 'b-01', tipo_vehiculo: 'BICICLETA', zona: 'Zona B' });
    afirmar_(lista.some(c => c.codigo === 'B-01' && c.estado === 'LIBRE'), 'B-01 no creada');
    esperarError_(409, () => CeldaService.guardar({ codigo: 'A-01', tipo_vehiculo: 'CARRO' }));
    const a02 = Db.buscarUno('celda', c => c.codigo === 'A-02');                               // ocupada por XYZ789
    esperarError_(409, () => CeldaService.guardar({ id_celda: a02.id_celda, codigo: 'A-02', tipo_vehiculo: 'CARRO', estado: 'MANTENIMIENTO' }));
    const a06 = Db.buscarUno('celda', c => c.codigo === 'A-06');
    CeldaService.guardar({ id_celda: a06.id_celda, codigo: 'A-06', tipo_vehiculo: 'CARRO', zona: 'Zona A', estado: 'MANTENIMIENTO' });
    afirmar_(celdaDe_('A-06').estado === 'MANTENIMIENTO', 'A-06 no quedó en mantenimiento');
    CeldaService.guardar({ id_celda: a06.id_celda, codigo: 'A-06', tipo_vehiculo: 'CARRO', zona: 'Zona A', estado: 'LIBRE' });
    const a01 = Db.buscarUno('celda', c => c.codigo === 'A-01');                               // asignada a ABC123
    esperarError_(409, () => CeldaService.guardar({ id_celda: a01.id_celda, codigo: 'A-01', tipo_vehiculo: 'MOTO' }));
  }],
  ['IT2 empleados: crear, contraseña y reglas de administrador', ctx => {
    const ana = EmpleadoService.guardar({ nombres: 'Ana', apellidos: 'Ruiz', documento: '555666', username: 'Ana.Ruiz', rol: 'OPERADOR', password: 'Clave2026' }, ctx.admin);
    afirmar_(ana.username === 'ana.ruiz' && ana.activo && ana.rol === ROLES.OPERADOR, JSON.stringify(ana));
    esperarError_(409, () => EmpleadoService.guardar({ nombres: 'X', apellidos: 'Y', documento: '777', username: 'ana.ruiz', rol: 'OPERADOR', password: 'Clave2026' }, ctx.admin));
    esperarError_(400, () => EmpleadoService.guardar({ nombres: 'X', apellidos: 'Y', documento: '778', username: 'nuevo', rol: 'OPERADOR', password: 'corta' }, ctx.admin));
    const datosAdmin = { id_empleado: ctx.admin.id_empleado, nombres: 'Admin', apellidos: 'Principal', documento: '1000000001' };
    esperarError_(409, () => EmpleadoService.guardar(Object.assign({}, datosAdmin, { rol: 'ADMINISTRADOR', activo: false }), ctx.admin));
    esperarError_(409, () => EmpleadoService.guardar(Object.assign({}, datosAdmin, { rol: 'OPERADOR', activo: true }), ctx.operador));
    EmpleadoService.restablecerPassword(ana.id_empleado, 'NuevaClave99');
    afirmar_(AuthService.login('ana.ruiz', 'NuevaClave99').empleado.username === 'ana.ruiz', 'login con la nueva contraseña');
  }],
  ['IT2 novedades: se asocian a la entrada abierta', ctx => {
    const r = NovedadService.registrar({ placa: 'xyz789', tipo: 'daño', descripcion: 'Rayón en la puerta trasera' }, ctx.operador);
    afirmar_(r.id_registro > 0, 'debería asociarse a la entrada abierta de XYZ789');
    const r2 = NovedadService.registrar({ placa: 'ABC123', tipo: 'OBJETO OLVIDADO', descripcion: 'Dejó una sombrilla en portería' }, ctx.operador);
    afirmar_(r2.id_registro === null, 'ABC123 no está dentro');
    esperarError_(400, () => NovedadService.registrar({ placa: 'ABC123', tipo: 'ROBO', descripcion: 'Tipo no permitido' }, ctx.operador));
    const l = NovedadService.listar({ placa: 'xyz' });
    afirmar_(l.length === 1 && l[0].tipo === 'DAÑO' && l[0].en_parqueadero, JSON.stringify(l));
  }],

  /* ---------- Iteración 3: pagos ---------- */
  ['IT3 cartera muestra mensualidades vencidas y por vencer', () => {
    const c = PagoService.cartera();
    const old = c.find(x => x.placa === 'OLD999'), xyz = c.find(x => x.placa === 'XYZ789');
    afirmar_(old && old.estado === 'VENCIDA' && xyz && xyz.estado === 'POR VENCER', JSON.stringify(c));
    afirmar_(!c.some(x => x.placa === 'ABC123'), 'ABC123 está al día');
  }],
  ['IT3 pagar una mensualidad vencida crea el periodo desde hoy y habilita la entrada', ctx => {
    const hoy = hoyStr_();
    const q = PagoService.consultar('OLD999');
    afirmar_(q.propuesta.fecha_inicio === hoy && q.propuesta.valor === 150000 && q.propuesta.id_celda, JSON.stringify(q.propuesta));
    const r = PagoService.registrar({ placa: 'OLD999', id_celda: q.propuesta.id_celda, valor: 150000, metodo_pago: 'EFECTIVO' }, ctx.admin);
    afirmar_(r.fecha_inicio === hoy && r.fecha_fin === finDeMes_(hoy) && r.celda === 'A-03', JSON.stringify(r));
    afirmar_(AccesoService.consultarEntrada('OLD999').puede_ingresar, 'debería poder ingresar tras pagar');
    afirmar_(!PagoService.cartera().some(x => x.placa === 'OLD999'), 'ya no debe estar en cartera');
  }],
  ['IT3 pago anticipado extiende desde el día siguiente al vencimiento', ctx => {
    const finActual = PagoService.estadoVehiculo_(AccesoService.vehiculo_('XYZ789')).fecha_fin;
    const q = PagoService.consultar('XYZ789');
    const r = PagoService.registrar({ placa: 'XYZ789', id_celda: q.propuesta.id_celda, valor: 150000, metodo_pago: 'TRANSFERENCIA', referencia: 'TRX-1' }, ctx.admin);
    afirmar_(r.fecha_inicio === sumarDias_(finActual, 1) && r.celda === 'A-02', JSON.stringify(r));
  }],
  ['IT3 celda de otro vehículo, tipo distinto y valor inválido son rechazados', ctx => {
    const id = codigo => Db.buscarUno('celda', c => c.codigo === codigo).id_celda;
    esperarError_(409, () => PagoService.registrar({ placa: 'SIN000', id_celda: id('A-01'), valor: 150000, metodo_pago: 'EFECTIVO' }, ctx.admin));
    esperarError_(400, () => PagoService.registrar({ placa: 'SIN000', id_celda: id('A-06'), valor: 0, metodo_pago: 'EFECTIVO' }, ctx.admin));
    esperarError_(400, () => PagoService.registrar({ placa: 'SIN000', id_celda: id('M-02'), valor: 150000, metodo_pago: 'EFECTIVO' }, ctx.admin));
    const h = PagoService.historial(hoyStr_(), hoyStr_());
    afirmar_(h.cantidad === 2 && h.total === 300000 && h.por_metodo.find(p => p.metodo === 'TRANSFERENCIA').total === 150000, JSON.stringify(h));
  }],
  ['IT2/IT3 permisos: el operador no gestiona clientes, celdas, empleados ni pagos', () => {
    const { token } = AuthService.login('operador', SEMILLA_EMPLEADOS[1].password);
    afirmar_(apiClientes(token, '').codigo === 403 && apiCeldas(token).codigo === 403 &&
      apiEmpleados(token).codigo === 403 && apiCartera(token).codigo === 403, 'operador con acceso indebido');
    afirmar_(apiNovedades(token, {}).ok, 'el operador debe poder ver las novedades');
    const admin = AuthService.login('admin', SEMILLA_EMPLEADOS[0].password).token;
    afirmar_(apiClientes(admin, '').ok && apiCeldas(admin).ok && apiCartera(admin).ok && apiPagos(admin, hoyStr_(), hoyStr_()).ok, 'admin debería acceder');
  }]
];
