/**
 * ReporteService – historial de movimientos (HU-07 / RF-09, RF-12) y
 * reporte de entradas y salidas por rango de fechas (HU-08 / RF-13).
 */
const ReporteService = {

  validarRango_(desde, hasta) {
    if (!desde || !hasta) throw new ErrorNegocio(400, 'Seleccione la fecha inicial y final');
    fechaLocal_(desde); fechaLocal_(hasta);
    if (desde > hasta) throw new ErrorNegocio(400, 'La fecha inicial no puede ser mayor que la final');
    if (diasEntre_(desde, hasta) + 1 > CONFIG.REPORTE_MAX_DIAS) {
      throw new ErrorNegocio(400, 'El rango máximo es de ' + CONFIG.REPORTE_MAX_DIAS + ' días');
    }
  },

  nombreEmpleado_(id) {
    const e = Db.porId('empleado', id);
    return e ? (e.nombres + ' ' + e.apellidos).trim() : '';
  },

  /** filtros: { desde, hasta, placa, estado } – fechas 'yyyy-MM-dd' sobre la fecha de entrada. */
  historial(filtros) {
    filtros = filtros || {};
    this.validarRango_(filtros.desde, filtros.hasta);
    const placa = normalizarPlaca_(filtros.placa);
    const estado = ESTADOS.REGISTRO.indexOf(filtros.estado) >= 0 ? filtros.estado : '';

    const filas = [];
    Db.todos('registro_acceso').forEach(r => {
      const dia = fechaStr_(r.fecha_hora_entrada);
      if (dia < filtros.desde || dia > filtros.hasta) return;
      if (estado && r.estado !== estado) return;
      const v = Db.porId('vehiculo', r.id_vehiculo) || {};
      const p = normalizarPlaca_(v.placa);
      if (placa && p.indexOf(placa) < 0) return;

      const c = Db.porId('cliente', v.id_cliente);
      const celda = Db.porId('celda', r.id_celda);
      const min = esFecha_(r.fecha_hora_salida) ? minutosEntre_(r.fecha_hora_entrada, r.fecha_hora_salida) : null;
      filas.push({
        id_registro: Number(r.id_registro),
        placa: p,
        propietario: c ? (c.nombres + ' ' + c.apellidos).trim() : '',
        celda: celda ? String(celda.codigo) : '',
        fecha_hora_entrada: fechaHoraStr_(r.fecha_hora_entrada),
        fecha_hora_salida: fechaHoraStr_(r.fecha_hora_salida),
        permanencia: duracionTexto_(min),
        estado: r.estado,
        empleado_entrada: this.nombreEmpleado_(r.id_empleado_entrada),
        empleado_salida: this.nombreEmpleado_(r.id_empleado_salida),
        observaciones: texto_(r.observaciones),
        _orden: isoStr_(r.fecha_hora_entrada)
      });
    });

    filas.sort((a, b) => b._orden.localeCompare(a._orden));
    filas.forEach(f => delete f._orden);
    const truncado = filas.length > CONFIG.HISTORIAL_MAX_FILAS;
    return { filas: filas.slice(0, CONFIG.HISTORIAL_MAX_FILAS), total: filas.length, truncado };
  },

  /** HU-08 CA1: total de entradas, salidas y promedio de permanencia por día. */
  movimientos(desde, hasta) {
    this.validarRango_(desde, hasta);
    const dias = {};
    for (let d = desde; d <= hasta; d = sumarDias_(d, 1)) {
      dias[d] = { fecha: d, entradas: 0, salidas: 0, minutos: 0 };
    }

    Db.todos('registro_acceso').forEach(r => {
      const dEntrada = fechaStr_(r.fecha_hora_entrada);
      if (dias[dEntrada]) dias[dEntrada].entradas++;
      if (esFecha_(r.fecha_hora_salida)) {
        const dSalida = fechaStr_(r.fecha_hora_salida);
        if (dias[dSalida]) {
          dias[dSalida].salidas++;
          dias[dSalida].minutos += minutosEntre_(r.fecha_hora_entrada, r.fecha_hora_salida);
        }
      }
    });

    const lista = Object.keys(dias).sort().map(k => {
      const d = dias[k];
      const prom = d.salidas ? Math.round(d.minutos / d.salidas) : null;
      return { fecha: d.fecha, entradas: d.entradas, salidas: d.salidas, promedio_min: prom, promedio: duracionTexto_(prom) };
    });
    const totalEntradas = lista.reduce((s, d) => s + d.entradas, 0);
    const totalSalidas = lista.reduce((s, d) => s + d.salidas, 0);
    const totalMin = Object.keys(dias).reduce((s, k) => s + dias[k].minutos, 0);
    const promedio = totalSalidas ? Math.round(totalMin / totalSalidas) : null;

    return {
      desde, hasta,
      dias: lista,
      total_entradas: totalEntradas,
      total_salidas: totalSalidas,
      promedio_min: promedio,
      promedio: duracionTexto_(promedio)
    };
  }
};
