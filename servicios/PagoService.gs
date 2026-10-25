/**
 * PagoService – Iteración 3: gestión de pagos de mensualidades.
 * Cada pago crea el siguiente periodo mensual (ACTIVA) del vehículo: si la mensualidad sigue vigente,
 * el nuevo periodo empieza el día siguiente a su vencimiento; si no, empieza hoy.
 */
const PagoService = {

  mensualidadesDe_(idVehiculo) {
    return Db.filtrar('mensualidad', m => Number(m.id_vehiculo) === Number(idVehiculo))
      .sort((a, b) => fechaStr_(b.fecha_fin).localeCompare(fechaStr_(a.fecha_fin)));
  },

  /** Resumen de la situación de pago de un vehículo. */
  estadoVehiculo_(v) {
    const hoy = hoyStr_();
    const activas = this.mensualidadesDe_(v.id_vehiculo).filter(m => m.estado !== 'CANCELADA');
    const ultima = activas.find(m => m.estado === 'ACTIVA') || activas[0] || null;
    if (!ultima) return { estado: 'SIN MENSUALIDAD', fecha_fin: '', dias_restantes: null, celda: '' };
    const fin = fechaStr_(ultima.fecha_fin);
    const dias = diasEntre_(hoy, fin);
    const celda = Db.porId('celda', ultima.id_celda);
    let estado = 'AL DÍA';
    if (ultima.estado !== 'ACTIVA' || dias < 0) estado = 'VENCIDA';
    else if (dias <= CONFIG.DIAS_ALERTA_VENCIMIENTO) estado = 'POR VENCER';
    return { estado, fecha_fin: fin, dias_restantes: dias, celda: celda ? String(celda.codigo) : '' };
  },

  /** Una celda está reservada si otro vehículo tiene una mensualidad ACTIVA que aún no vence en ella. */
  celdaReservadaPor_(idCelda, idVehiculo) {
    const hoy = hoyStr_();
    const m = Db.buscarUno('mensualidad', x => Number(x.id_celda) === Number(idCelda) && Number(x.id_vehiculo) !== Number(idVehiculo) &&
      x.estado === 'ACTIVA' && fechaStr_(x.fecha_fin) >= hoy);
    if (!m) return null;
    const v = Db.porId('vehiculo', m.id_vehiculo);
    return v ? normalizarPlaca_(v.placa) : 'otro vehículo';
  },

  periodoSiguiente_(idVehiculo) {
    const hoy = hoyStr_();
    const ultima = this.mensualidadesDe_(idVehiculo).find(m => m.estado === 'ACTIVA' && fechaStr_(m.fecha_fin) >= hoy);
    const inicio = ultima ? sumarDias_(fechaStr_(ultima.fecha_fin), 1) : hoy;
    return { inicio, fin: finDeMes_(inicio), anterior: ultima || this.mensualidadesDe_(idVehiculo).find(m => m.estado !== 'CANCELADA') || null };
  },

  /** Paso "Buscar" de la pantalla de pagos: datos del vehículo, celdas posibles y propuesta de periodo. */
  consultar(placa) {
    const v = AccesoService.vehiculo_(placa);
    const cliente = Db.porId('cliente', v.id_cliente);
    const periodo = this.periodoSiguiente_(v.id_vehiculo);
    const celdas = Db.filtrar('celda', c => c.tipo_vehiculo === v.tipo_vehiculo && c.estado !== 'MANTENIMIENTO' &&
      !this.celdaReservadaPor_(c.id_celda, v.id_vehiculo))
      .map(c => ({ id_celda: Number(c.id_celda), codigo: String(c.codigo), zona: String(c.zona || '') }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    const anterior = periodo.anterior ? Number(periodo.anterior.id_celda) : null;
    return {
      placa: normalizarPlaca_(v.placa),
      vehiculo: { tipo: v.tipo_vehiculo, marca: String(v.marca || ''), color: String(v.color || '') },
      cliente: cliente ? { nombre: (cliente.nombres + ' ' + cliente.apellidos).trim(), estado: cliente.estado, telefono: String(cliente.telefono || '') } : null,
      situacion: this.estadoVehiculo_(v),
      propuesta: {
        fecha_inicio: periodo.inicio,
        fecha_fin: periodo.fin,
        valor: CONFIG.TARIFAS[v.tipo_vehiculo] || 0,
        id_celda: celdas.some(c => c.id_celda === anterior) ? anterior : (celdas[0] ? celdas[0].id_celda : null)
      },
      celdas
    };
  },

  registrar(datos, empleado) {
    datos = datos || {};
    return conBloqueo_(() => {
      const v = AccesoService.vehiculo_(datos.placa);
      const cliente = Db.porId('cliente', v.id_cliente);
      if (!cliente) throw new ErrorNegocio(404, 'El vehículo no tiene un cliente válido');
      if (cliente.estado === 'INACTIVO') throw new ErrorNegocio(409, 'El cliente está INACTIVO; actívelo antes de registrar el pago');
      const metodo = opcion_(datos.metodo_pago, ESTADOS.METODO_PAGO, 'Método de pago');
      const valor = Math.round(Number(datos.valor));
      if (!(valor > 0) || valor > 100000000) throw new ErrorNegocio(400, 'El valor del pago debe ser mayor que cero');

      const celda = Db.porId('celda', datos.id_celda);
      if (!celda) throw new ErrorNegocio(400, 'Seleccione la celda asignada');
      if (celda.tipo_vehiculo !== v.tipo_vehiculo) throw new ErrorNegocio(400, 'La celda ' + celda.codigo + ' es para ' + celda.tipo_vehiculo);
      if (celda.estado === 'MANTENIMIENTO') throw new ErrorNegocio(409, 'La celda ' + celda.codigo + ' está en mantenimiento');
      const otro = this.celdaReservadaPor_(celda.id_celda, v.id_vehiculo);
      if (otro) throw new ErrorNegocio(409, 'La celda ' + celda.codigo + ' ya está asignada a ' + otro);

      const periodo = this.periodoSiguiente_(v.id_vehiculo);
      const mensualidad = Db.insertar('mensualidad', {
        id_cliente: Number(cliente.id_cliente),
        id_vehiculo: Number(v.id_vehiculo),
        id_celda: Number(celda.id_celda),
        fecha_inicio: fechaLocal_(periodo.inicio),
        fecha_fin: fechaLocal_(periodo.fin),
        valor,
        estado: 'ACTIVA'
      });
      const ahora = new Date();
      const pago = Db.insertar('pago', {
        id_mensualidad: Number(mensualidad.id_mensualidad),
        id_empleado: empleado.id_empleado,
        fecha_pago: ahora,
        valor,
        metodo_pago: metodo,
        referencia: texto_(datos.referencia, 50)
      });
      return {
        id_pago: pago.id_pago,
        placa: normalizarPlaca_(v.placa),
        cliente: (cliente.nombres + ' ' + cliente.apellidos).trim(),
        celda: String(celda.codigo),
        fecha_inicio: periodo.inicio,
        fecha_fin: periodo.fin,
        valor,
        metodo_pago: metodo,
        fecha_pago: fechaHoraStr_(ahora),
        empleado: empleado.nombre,
        mensaje: 'Pago registrado: ' + normalizarPlaca_(v.placa) + ' queda al día hasta el ' + periodo.fin
      };
    });
  },

  /** Vehículos con mensualidad vencida, por vencer o sin mensualidad (clientes activos). */
  cartera() {
    const orden = { 'VENCIDA': 0, 'SIN MENSUALIDAD': 1, 'POR VENCER': 2 };
    return Db.todos('vehiculo')
      .map(v => {
        const c = Db.porId('cliente', v.id_cliente);
        return { v, c, s: this.estadoVehiculo_(v) };
      })
      .filter(x => x.c && x.c.estado === 'ACTIVO' && x.s.estado !== 'AL DÍA')
      .map(x => ({
        placa: normalizarPlaca_(x.v.placa),
        tipo: x.v.tipo_vehiculo,
        cliente: (x.c.nombres + ' ' + x.c.apellidos).trim(),
        telefono: String(x.c.telefono || ''),
        estado: x.s.estado,
        fecha_fin: x.s.fecha_fin,
        dias_restantes: x.s.dias_restantes
      }))
      .sort((a, b) => (orden[a.estado] - orden[b.estado]) || ((a.dias_restantes || 0) - (b.dias_restantes || 0)));
  },

  /** Pagos recibidos en un rango de fechas, con totales por método. */
  historial(desde, hasta) {
    ReporteService.validarRango_(desde, hasta);
    const filas = Db.todos('pago')
      .filter(p => { const d = fechaStr_(p.fecha_pago); return d >= desde && d <= hasta; })
      .map(p => {
        const m = Db.porId('mensualidad', p.id_mensualidad) || {};
        const v = Db.porId('vehiculo', m.id_vehiculo) || {};
        const c = Db.porId('cliente', m.id_cliente);
        const celda = Db.porId('celda', m.id_celda);
        return {
          id_pago: Number(p.id_pago),
          fecha_pago: fechaHoraStr_(p.fecha_pago),
          placa: normalizarPlaca_(v.placa),
          cliente: c ? (c.nombres + ' ' + c.apellidos).trim() : '',
          celda: celda ? String(celda.codigo) : '',
          periodo: fechaStr_(m.fecha_inicio) + ' a ' + fechaStr_(m.fecha_fin),
          valor: Number(p.valor) || 0,
          metodo_pago: p.metodo_pago,
          referencia: texto_(p.referencia),
          empleado: ReporteService.nombreEmpleado_(p.id_empleado),
          _orden: isoStr_(p.fecha_pago)
        };
      })
      .sort((a, b) => b._orden.localeCompare(a._orden));
    filas.forEach(f => delete f._orden);
    const porMetodo = ESTADOS.METODO_PAGO.map(metodo => ({
      metodo, total: filas.filter(f => f.metodo_pago === metodo).reduce((s, f) => s + f.valor, 0)
    }));
    return { filas, total: filas.reduce((s, f) => s + f.valor, 0), cantidad: filas.length, por_metodo: porMetodo };
  }
};
