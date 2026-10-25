/**
 * ClienteService – Iteración 2: gestión de clientes (usuarios del parqueadero) y sus vehículos.
 * No se eliminan registros (integridad referencial): un cliente se desactiva con estado INACTIVO.
 */
const ClienteService = {

  dto_(c) {
    return {
      id_cliente: Number(c.id_cliente),
      tipo_documento: c.tipo_documento,
      numero_documento: String(c.numero_documento),
      nombres: String(c.nombres),
      apellidos: String(c.apellidos),
      nombre: (c.nombres + ' ' + c.apellidos).trim(),
      telefono: String(c.telefono || ''),
      correo: String(c.correo || ''),
      direccion: String(c.direccion || ''),
      estado: c.estado,
      fecha_registro: fechaStr_(c.fecha_registro)
    };
  },

  vehiculosDe_(idCliente) {
    return Db.filtrar('vehiculo', v => Number(v.id_cliente) === Number(idCliente));
  },

  listar(busqueda) {
    const q = texto_(busqueda).toLowerCase();
    return Db.todos('cliente')
      .map(c => {
        const d = this.dto_(c);
        d.placas = this.vehiculosDe_(c.id_cliente).map(v => normalizarPlaca_(v.placa));
        return d;
      })
      .filter(c => !q || [c.nombre, c.numero_documento, c.telefono, c.placas.join(' ')].join(' ').toLowerCase().indexOf(q) >= 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  },

  detalle(idCliente) {
    const c = Db.porId('cliente', idCliente);
    if (!c) throw new ErrorNegocio(404, 'Cliente no encontrado');
    return {
      cliente: this.dto_(c),
      vehiculos: this.vehiculosDe_(c.id_cliente).map(v => ({
        id_vehiculo: Number(v.id_vehiculo),
        placa: normalizarPlaca_(v.placa),
        tipo_vehiculo: v.tipo_vehiculo,
        marca: String(v.marca || ''),
        color: String(v.color || ''),
        mensualidad: PagoService.estadoVehiculo_(v)
      }))
    };
  },

  guardar(datos) {
    datos = datos || {};
    return conBloqueo_(() => {
      const id = Number(datos.id_cliente) || null;
      const registro = {
        tipo_documento: opcion_(datos.tipo_documento, ESTADOS.TIPO_DOCUMENTO, 'Tipo de documento'),
        numero_documento: requerido_(datos.numero_documento, 'número de documento', 20).replace(/\s+/g, ''),
        nombres: requerido_(datos.nombres, 'nombres', 80),
        apellidos: requerido_(datos.apellidos, 'apellidos', 80),
        telefono: texto_(datos.telefono, 20),
        correo: texto_(datos.correo, 100).toLowerCase(),
        direccion: texto_(datos.direccion, 150),
        estado: opcion_(datos.estado || 'ACTIVO', ESTADOS.CLIENTE, 'Estado')
      };
      if (!/^[A-Za-z0-9-]{3,20}$/.test(registro.numero_documento)) throw new ErrorNegocio(400, 'Número de documento inválido');
      if (registro.telefono && !/^[0-9+ ()-]{7,20}$/.test(registro.telefono)) throw new ErrorNegocio(400, 'Teléfono inválido');
      if (registro.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(registro.correo)) throw new ErrorNegocio(400, 'Correo inválido');

      const repetido = Db.buscarUno('cliente', c => String(c.numero_documento) === registro.numero_documento && Number(c.id_cliente) !== id);
      if (repetido) throw new ErrorNegocio(409, 'Ya existe un cliente con el documento ' + registro.numero_documento);

      let guardado;
      if (id) {
        if (!Db.porId('cliente', id)) throw new ErrorNegocio(404, 'Cliente no encontrado');
        guardado = Db.actualizar('cliente', id, registro);
      } else {
        guardado = Db.insertar('cliente', Object.assign(registro, { fecha_registro: new Date() }));
      }
      return this.detalle(guardado.id_cliente);
    });
  },

  guardarVehiculo(datos) {
    datos = datos || {};
    return conBloqueo_(() => {
      const id = Number(datos.id_vehiculo) || null;
      const cliente = Db.porId('cliente', datos.id_cliente);
      if (!cliente) throw new ErrorNegocio(404, 'Cliente no encontrado');
      const placa = normalizarPlaca_(datos.placa);
      if (!esPlacaValida_(placa)) throw new ErrorNegocio(400, 'Placa inválida (3 a 10 letras o números)');   // RN-07
      const registro = {
        placa,
        tipo_vehiculo: opcion_(datos.tipo_vehiculo, ESTADOS.TIPO_VEHICULO, 'Tipo de vehículo'),
        marca: texto_(datos.marca, 40),
        color: texto_(datos.color, 30),
        id_cliente: Number(cliente.id_cliente)
      };
      const repetido = Db.buscarUno('vehiculo', v => normalizarPlaca_(v.placa) === placa && Number(v.id_vehiculo) !== id);
      if (repetido) throw new ErrorNegocio(409, 'La placa ' + placa + ' ya está registrada');

      if (id) {
        const actual = Db.porId('vehiculo', id);
        if (!actual) throw new ErrorNegocio(404, 'Vehículo no encontrado');
        const dentro = AccesoService.abierto_(id);
        if (dentro && (normalizarPlaca_(actual.placa) !== placa || actual.tipo_vehiculo !== registro.tipo_vehiculo)) {
          throw new ErrorNegocio(409, 'No se puede cambiar la placa o el tipo mientras el vehículo está en el parqueadero');
        }
        Db.actualizar('vehiculo', id, registro);
      } else {
        Db.insertar('vehiculo', registro);
      }
      return this.detalle(cliente.id_cliente);
    });
  }
};
