/**
 * EmpleadoService – Iteración 2: gestión de empleados (cuentas del personal) desde la aplicación.
 * Reglas: usuario y documento únicos, contraseña segura, nadie se desactiva ni se quita el rol a sí mismo,
 * y siempre queda al menos un administrador activo.
 */
const EmpleadoService = {

  dto_(e) {
    const rol = Db.porId('rol', e.id_rol);
    return {
      id_empleado: Number(e.id_empleado),
      nombres: String(e.nombres),
      apellidos: String(e.apellidos),
      nombre: (e.nombres + ' ' + e.apellidos).trim(),
      documento: String(e.documento),
      username: String(e.username),
      rol: rol ? rol.nombre : '',
      activo: esVerdadero_(e.activo)
    };
  },

  listar() {
    return Db.todos('empleado').map(e => this.dto_(e)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  },

  adminsActivos_() {
    const rolAdmin = Db.buscarUno('rol', r => r.nombre === ROLES.ADMIN);
    return Db.filtrar('empleado', e => Number(e.id_rol) === Number(rolAdmin.id_rol) && esVerdadero_(e.activo));
  },

  guardar(datos, actual) {
    datos = datos || {};
    return conBloqueo_(() => {
      const id = Number(datos.id_empleado) || null;
      const rolNombre = opcion_(datos.rol, [ROLES.ADMIN, ROLES.OPERADOR], 'Rol');
      const rol = Db.buscarUno('rol', r => r.nombre === rolNombre);
      const registro = {
        id_rol: Number(rol.id_rol),
        nombres: requerido_(datos.nombres, 'nombres', 80),
        apellidos: requerido_(datos.apellidos, 'apellidos', 80),
        documento: requerido_(datos.documento, 'documento', 20).replace(/\s+/g, ''),
        activo: datos.activo === undefined ? true : esVerdadero_(datos.activo)
      };
      const docRepetido = Db.buscarUno('empleado', e => String(e.documento) === registro.documento && Number(e.id_empleado) !== id);
      if (docRepetido) throw new ErrorNegocio(409, 'Ya existe un empleado con el documento ' + registro.documento);

      if (id) {
        const previo = Db.porId('empleado', id);
        if (!previo) throw new ErrorNegocio(404, 'Empleado no encontrado');
        if (id === actual.id_empleado && (!registro.activo || rolNombre !== ROLES.ADMIN)) {
          throw new ErrorNegocio(409, 'No puede desactivarse ni quitarse el rol de administrador a sí mismo');
        }
        const eraAdminActivo = this.adminsActivos_().some(e => Number(e.id_empleado) === id);
        const sigueAdminActivo = registro.activo && rolNombre === ROLES.ADMIN;
        if (eraAdminActivo && !sigueAdminActivo && this.adminsActivos_().length <= 1) {
          throw new ErrorNegocio(409, 'Debe quedar al menos un administrador activo');
        }
        Db.actualizar('empleado', id, registro);
        return this.dto_(Db.porId('empleado', id));
      }

      const username = texto_(datos.username, 40).toLowerCase();
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new ErrorNegocio(400, 'Usuario inválido (3 a 40 caracteres: letras, números, . _ -)');
      if (Db.buscarUno('empleado', e => String(e.username).toLowerCase() === username)) throw new ErrorNegocio(409, 'El usuario ' + username + ' ya existe');
      this.validarPassword_(datos.password);
      const nuevo = Db.insertar('empleado', Object.assign(registro, { username, password_hash: AuthService.hashPassword(datos.password) }));
      return this.dto_(nuevo);
    });
  },

  restablecerPassword(idEmpleado, password) {
    return conBloqueo_(() => {
      const emp = Db.porId('empleado', idEmpleado);
      if (!emp) throw new ErrorNegocio(404, 'Empleado no encontrado');
      this.validarPassword_(password);
      Db.actualizar('empleado', emp.id_empleado, { password_hash: AuthService.hashPassword(password) });
      CacheService.getScriptCache().remove('login_fail_' + String(emp.username).toLowerCase());
      return { mensaje: 'Contraseña actualizada para ' + emp.username };
    });
  },

  validarPassword_(p) {
    if (!p || String(p).length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) {
      throw new ErrorNegocio(400, 'La contraseña debe tener mínimo 8 caracteres, con letras y números');
    }
  }
};
