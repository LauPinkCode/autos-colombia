/**
 * NovedadService – Iteración 2: registro de novedades por vehículo (daños, objetos olvidados, incidentes).
 * Si el vehículo está dentro del parqueadero, la novedad queda asociada a su entrada abierta.
 */
const NovedadService = {

  registrar(datos, empleado) {
    datos = datos || {};
    return conBloqueo_(() => {
      const v = AccesoService.vehiculo_(datos.placa);
      const tipo = opcion_(datos.tipo, ESTADOS.TIPO_NOVEDAD, 'Tipo de novedad');
      const descripcion = requerido_(datos.descripcion, 'descripción', 1000);
      if (descripcion.length < 5) throw new ErrorNegocio(400, 'Describa la novedad con al menos 5 caracteres');
      const abierto = AccesoService.abierto_(v.id_vehiculo);
      const ahora = new Date();
      const n = Db.insertar('novedad', {
        id_vehiculo: Number(v.id_vehiculo),
        id_registro: abierto ? Number(abierto.id_registro) : '',
        id_empleado: empleado.id_empleado,
        tipo,
        descripcion,
        fecha_hora: ahora
      });
      return {
        id_novedad: n.id_novedad,
        id_registro: abierto ? Number(abierto.id_registro) : null,
        mensaje: 'Novedad registrada para ' + normalizarPlaca_(v.placa) + (abierto ? ' (vehículo dentro del parqueadero)' : '')
      };
    });
  },

  /** filtros: { desde, hasta, placa } – por defecto los últimos 30 días. */
  listar(filtros) {
    filtros = filtros || {};
    const hasta = filtros.hasta || hoyStr_();
    const desde = filtros.desde || sumarDias_(hasta, -(CONFIG.NOVEDADES_DIAS_DEFECTO - 1));
    ReporteService.validarRango_(desde, hasta);
    const placa = normalizarPlaca_(filtros.placa);
    return Db.todos('novedad')
      .filter(n => { const d = fechaStr_(n.fecha_hora); return d >= desde && d <= hasta; })
      .map(n => {
        const v = Db.porId('vehiculo', n.id_vehiculo) || {};
        return {
          id_novedad: Number(n.id_novedad),
          fecha_hora: fechaHoraStr_(n.fecha_hora),
          placa: normalizarPlaca_(v.placa),
          tipo: n.tipo,
          descripcion: texto_(n.descripcion),
          en_parqueadero: n.id_registro !== '' && n.id_registro !== null,
          empleado: ReporteService.nombreEmpleado_(n.id_empleado),
          _orden: isoStr_(n.fecha_hora)
        };
      })
      .filter(n => !placa || n.placa.indexOf(placa) >= 0)
      .sort((a, b) => b._orden.localeCompare(a._orden))
      .map(n => { delete n._orden; return n; });
  }
};
