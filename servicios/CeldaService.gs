/**
 * CeldaService – HU-06 / RF-10: disponibilidad de celdas y movimientos del día.
 * Los contadores se leen directamente del estado real de las hojas (CA2).
 */
const CeldaService = {

  resumen() {
    const celdas = Db.todos('celda');
    const contar = estado => celdas.filter(c => c.estado === estado).length;
    const hoy = hoyStr_();
    const registros = Db.todos('registro_acceso');

    return {
      fecha: hoy,
      total: celdas.length,
      libres: contar('LIBRE'),
      ocupadas: contar('OCUPADA'),
      mantenimiento: contar('MANTENIMIENTO'),
      entradas_hoy: registros.filter(r => fechaStr_(r.fecha_hora_entrada) === hoy).length,
      salidas_hoy: registros.filter(r => esFecha_(r.fecha_hora_salida) && fechaStr_(r.fecha_hora_salida) === hoy).length,
      por_tipo: ESTADOS.TIPO_VEHICULO.map(tipo => {
        const deTipo = celdas.filter(c => c.tipo_vehiculo === tipo);
        return { tipo, total: deTipo.length, libres: deTipo.filter(c => c.estado === 'LIBRE').length };
      }).filter(t => t.total > 0)
    };
  },

  /** Mapa de celdas: estado de cada celda y placa del vehículo que la ocupa. */
  mapa() {
    const placaPorCelda = {};
    Db.filtrar('registro_acceso', r => r.estado === 'ABIERTO').forEach(r => {
      const v = Db.porId('vehiculo', r.id_vehiculo);
      placaPorCelda[Number(r.id_celda)] = v ? normalizarPlaca_(v.placa) : '';
    });
    return Db.todos('celda')
      .map(c => ({
        codigo: String(c.codigo),
        tipo: c.tipo_vehiculo,
        zona: String(c.zona || ''),
        estado: c.estado,
        placa: placaPorCelda[Number(c.id_celda)] || ''
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  },

  /** Iteración 2: listado para administrar celdas, con el vehículo al que está asignada cada una. */
  listarAdmin() {
    const ocupada = {};
    this.mapa().forEach(c => { ocupada[c.codigo] = c.placa; });
    return Db.todos('celda')
      .map(c => ({
        id_celda: Number(c.id_celda),
        codigo: String(c.codigo),
        tipo_vehiculo: c.tipo_vehiculo,
        zona: String(c.zona || ''),
        estado: c.estado,
        placa_dentro: ocupada[String(c.codigo)] || '',
        asignada_a: PagoService.celdaReservadaPor_(c.id_celda, -1) || ''
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  },

  /**
   * Crear o editar una celda. El estado OCUPADA solo lo cambian las entradas y salidas (RN-05):
   * aquí únicamente se alterna entre LIBRE y MANTENIMIENTO.
   */
  guardar(datos) {
    datos = datos || {};
    return conBloqueo_(() => {
      const id = Number(datos.id_celda) || null;
      const codigo = requerido_(datos.codigo, 'código', 10).toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9-]{2,10}$/.test(codigo)) throw new ErrorNegocio(400, 'Código inválido (2 a 10 letras, números o guiones)');
      const tipo = opcion_(datos.tipo_vehiculo, ESTADOS.TIPO_VEHICULO, 'Tipo de vehículo');
      const estado = opcion_(datos.estado || 'LIBRE', ['LIBRE', 'MANTENIMIENTO'], 'Estado');
      const zona = texto_(datos.zona, 30);
      if (Db.buscarUno('celda', c => String(c.codigo).toUpperCase() === codigo && Number(c.id_celda) !== id)) {
        throw new ErrorNegocio(409, 'Ya existe una celda con el código ' + codigo);
      }
      if (!id) {
        Db.insertar('celda', { codigo, tipo_vehiculo: tipo, zona, estado });
        return this.listarAdmin();
      }
      const actual = Db.porId('celda', id);
      if (!actual) throw new ErrorNegocio(404, 'Celda no encontrada');
      if (actual.estado === 'OCUPADA') {
        if (tipo !== actual.tipo_vehiculo || estado === 'MANTENIMIENTO') {
          throw new ErrorNegocio(409, 'La celda ' + actual.codigo + ' está OCUPADA: registre la salida antes de cambiar su tipo o estado');
        }
        Db.actualizar('celda', id, { codigo, zona });
        return this.listarAdmin();
      }
      const asignada = PagoService.celdaReservadaPor_(id, -1);
      if (asignada && tipo !== actual.tipo_vehiculo) {
        throw new ErrorNegocio(409, 'No se puede cambiar el tipo: la celda está asignada a ' + asignada);
      }
      Db.actualizar('celda', id, { codigo, tipo_vehiculo: tipo, zona, estado });
      return this.listarAdmin();
    });
  }
};
