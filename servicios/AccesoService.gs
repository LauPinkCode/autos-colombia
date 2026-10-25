/**
 * AccesoService – lógica de negocio de entradas y salidas (RN-01 a RN-07).
 * HU-02, HU-03, HU-04, HU-05 · RF-01 a RF-08, RF-12.
 */
const AccesoService = {

  vehiculo_(placa) {
    const p = normalizarPlaca_(placa);
    if (!esPlacaValida_(p)) throw new ErrorNegocio(400, 'Digite una placa válida (solo letras y números)');
    const v = Db.buscarUno('vehiculo', r => normalizarPlaca_(r.placa) === p);
    if (!v) throw new ErrorNegocio(404, 'Vehículo no registrado');
    return v;
  },

  abierto_(idVehiculo) {
    return Db.buscarUno('registro_acceso', r => Number(r.id_vehiculo) === Number(idVehiculo) && r.estado === 'ABIERTO');
  },

  propietario_(v) {
    const c = Db.porId('cliente', v.id_cliente);
    return c
      ? { nombre: (c.nombres + ' ' + c.apellidos).trim(), documento: c.tipo_documento + ' ' + c.numero_documento, telefono: String(c.telefono || '') }
      : { nombre: '(sin propietario)', documento: '', telefono: '' };
  },

  /**
   * Evalúa si el vehículo puede ingresar sin modificar nada.
   * RN-03 (entrada duplicada) se reporta como error; mensualidad y celda como motivo de bloqueo.
   */
  evaluarEntrada_(v) {
    if (this.abierto_(v.id_vehiculo)) throw new ErrorNegocio(409, 'El vehículo ya se encuentra en el parqueadero');

    const hoy = hoyStr_();
    const mensualidades = Db.filtrar('mensualidad', m => Number(m.id_vehiculo) === Number(v.id_vehiculo));
    // RN-01: mensualidad ACTIVA y fecha actual entre inicio y fin
    const vigente = mensualidades.find(m =>
      m.estado === 'ACTIVA' && fechaStr_(m.fecha_inicio) <= hoy && fechaStr_(m.fecha_fin) >= hoy) || null;
    const referencia = vigente || mensualidades.slice().sort((a, b) =>
      fechaStr_(b.fecha_fin).localeCompare(fechaStr_(a.fecha_fin)))[0] || null;

    let motivo = null;
    let alerta = null;
    let diasRestantes = null;
    let codigo = 403;
    // RN-02: el vehículo solo puede ocupar la celda asignada en su mensualidad
    const celda = referencia ? Db.porId('celda', referencia.id_celda) : null;
    const cliente = Db.porId('cliente', v.id_cliente);

    if (cliente && cliente.estado === 'INACTIVO') {
      motivo = 'El cliente está INACTIVO. Informe al administrador.';
    } else if (!vigente) {
      motivo = motivoSinMensualidad_(referencia, hoy);
    } else {
      codigo = 409;
      diasRestantes = diasEntre_(hoy, fechaStr_(vigente.fecha_fin));
      if (diasRestantes <= CONFIG.DIAS_ALERTA_VENCIMIENTO) {
        alerta = diasRestantes === 0 ? 'La mensualidad vence HOY' : 'La mensualidad vence en ' + diasRestantes + ' día(s)';
      }
      if (!celda) motivo = 'La mensualidad no tiene una celda asignada válida. Informe al administrador.';
      else if (celda.estado !== 'LIBRE') motivo = 'La celda ' + celda.codigo + ' está ' + celda.estado + '. Informe al administrador.';
    }

    const ficha = {
      placa: normalizarPlaca_(v.placa),
      vehiculo: { tipo: v.tipo_vehiculo, marca: String(v.marca || ''), color: String(v.color || '') },
      propietario: this.propietario_(v),
      mensualidad: referencia ? {
        fecha_inicio: fechaStr_(referencia.fecha_inicio),
        fecha_fin: fechaStr_(referencia.fecha_fin),
        estado: referencia.estado,
        vigente: !!vigente,
        dias_restantes: diasRestantes
      } : null,
      celda: celda ? { codigo: String(celda.codigo), zona: String(celda.zona || ''), estado: celda.estado } : null,
      puede_ingresar: !motivo,
      motivo,
      alerta
    };
    return { ficha, vigente, celda, codigo };
  },

  /** Paso "Buscar" de la pantalla de entrada (HU-02 CA1-CA3, HU-03). */
  consultarEntrada(placa) {
    return this.evaluarEntrada_(this.vehiculo_(placa)).ficha;
  },

  /** Paso "Confirmar" (HU-02 CA4): repite todas las validaciones bajo bloqueo. */
  registrarEntrada(placa, empleado, observaciones) {
    return conBloqueo_(() => {
      const v = this.vehiculo_(placa);
      const ev = this.evaluarEntrada_(v);
      if (!ev.ficha.puede_ingresar) throw new ErrorNegocio(ev.codigo, ev.ficha.motivo);

      const ahora = new Date();
      Db.actualizar('celda', ev.celda.id_celda, { estado: 'OCUPADA' });             // RN-05
      let registro;
      try {
        registro = Db.insertar('registro_acceso', {
          id_vehiculo: Number(v.id_vehiculo),
          id_celda: Number(ev.celda.id_celda),
          id_mensualidad: Number(ev.vigente.id_mensualidad),
          id_empleado_entrada: empleado.id_empleado,                                 // RN-06 / RF-12
          id_empleado_salida: '',
          fecha_hora_entrada: ahora,
          fecha_hora_salida: '',
          estado: 'ABIERTO',
          observaciones: texto_(observaciones, 255)
        });
      } catch (e) {
        Db.actualizar('celda', ev.celda.id_celda, { estado: 'LIBRE' });             // compensación
        throw e;
      }

      ev.ficha.celda.estado = 'OCUPADA';
      return Object.assign(ev.ficha, {
        id_registro: registro.id_registro,
        fecha_hora_entrada: fechaHoraStr_(ahora),
        empleado: empleado.nombre,
        mensaje: 'Entrada registrada: ' + ev.ficha.placa + ' en la celda ' + ev.ficha.celda.codigo
      });
    });
  },

  fichaSalida_(v, reg) {
    const celda = Db.porId('celda', reg.id_celda);
    const entrada = reg.fecha_hora_entrada;
    const min = esFecha_(entrada) ? minutosEntre_(entrada, new Date()) : null;
    return {
      placa: normalizarPlaca_(v.placa),
      vehiculo: { tipo: v.tipo_vehiculo, marca: String(v.marca || ''), color: String(v.color || '') },
      propietario: this.propietario_(v),
      celda: celda ? { codigo: String(celda.codigo), zona: String(celda.zona || '') } : null,
      fecha_hora_entrada: fechaHoraStr_(entrada),
      entrada_iso: isoStr_(entrada),
      permanencia_min: min,
      permanencia: duracionTexto_(min)
    };
  },

  /** Paso "Buscar" de la pantalla de salida (HU-04 CA1-CA2). */
  consultarSalida(placa) {
    const v = this.vehiculo_(placa);
    const reg = this.abierto_(v.id_vehiculo);
    if (!reg) throw new ErrorNegocio(409, 'El vehículo no tiene una entrada registrada');   // RN-04
    return this.fichaSalida_(v, reg);
  },

  /** Paso "Confirmar" (HU-04 CA3). */
  registrarSalida(placa, empleado, observaciones) {
    return conBloqueo_(() => {
      const v = this.vehiculo_(placa);
      const reg = this.abierto_(v.id_vehiculo);
      if (!reg) throw new ErrorNegocio(409, 'El vehículo no tiene una entrada registrada');

      const ahora = new Date();
      const obs = [texto_(reg.observaciones), texto_(observaciones)].filter(String).join(' | ').substring(0, 255);
      Db.actualizar('registro_acceso', reg.id_registro, {
        fecha_hora_salida: ahora,
        id_empleado_salida: empleado.id_empleado,
        estado: 'CERRADO',
        observaciones: obs
      });
      Db.actualizar('celda', reg.id_celda, { estado: 'LIBRE' });                     // RN-05

      const ficha = this.fichaSalida_(v, reg);
      const min = minutosEntre_(reg.fecha_hora_entrada, ahora);
      return Object.assign(ficha, {
        id_registro: Number(reg.id_registro),
        fecha_hora_salida: fechaHoraStr_(ahora),
        permanencia_min: min,
        permanencia: duracionTexto_(min),
        empleado: empleado.nombre,
        mensaje: 'Salida registrada: ' + ficha.placa + '. Celda ' + (ficha.celda ? ficha.celda.codigo : '') + ' liberada.'
      });
    });
  },

  /** HU-05 / RF-08: vehículos presentes en el parqueadero. */
  listarActivos() {
    return Db.filtrar('registro_acceso', r => r.estado === 'ABIERTO')
      .map(r => {
        const v = Db.porId('vehiculo', r.id_vehiculo) || {};
        const ficha = this.fichaSalida_(v, r);
        return {
          id_registro: Number(r.id_registro),
          placa: ficha.placa,
          tipo: ficha.vehiculo.tipo,
          propietario: ficha.propietario.nombre,
          celda: ficha.celda ? ficha.celda.codigo : '',
          fecha_hora_entrada: ficha.fecha_hora_entrada,
          entrada_iso: ficha.entrada_iso,
          permanencia_min: ficha.permanencia_min
        };
      })
      .sort((a, b) => a.entrada_iso.localeCompare(b.entrada_iso));
  }
};

function motivoSinMensualidad_(m, hoy) {
  if (!m) return 'El vehículo no tiene mensualidad registrada';
  if (m.estado === 'CANCELADA') return 'La mensualidad está CANCELADA';
  if (m.estado === 'ACTIVA' && fechaStr_(m.fecha_inicio) > hoy) return 'La mensualidad inicia el ' + fechaStr_(m.fecha_inicio);
  return 'La mensualidad está vencida desde el ' + fechaStr_(m.fecha_fin);
}
