/**
 * Autos Colombia – Iteración 1: Gestión de entrada y salida de vehículos.
 * Configuración general y esquema de datos: cada tabla es una hoja de Google Sheets.
 *
 * Cada "tabla" es una hoja de cálculo; la primera columna es la llave primaria.
 */

const CONFIG = {
  TZ: 'America/Bogota',            // RN-06: hora del servidor en zona America/Bogotá
  TOKEN_HORAS: 8,                  // RNF-02 / HU-01 CA4: la sesión expira a las 8 h
  DIAS_ALERTA_VENCIMIENTO: 5,      // HU-03 CA3
  BACKUP_CARPETA: 'Autos Colombia - Respaldos',
  BACKUP_RETENCION_DIAS: 30,       // RNF-07
  HASH_ITERACIONES: 1000,          // RNF-02: derivación iterada de la contraseña
  LOGIN_MAX_INTENTOS: 5,           // Bloqueo temporal ante fuerza bruta
  LOGIN_BLOQUEO_MIN: 15,
  HISTORIAL_MAX_FILAS: 5000,
  REPORTE_MAX_DIAS: 366,
  TARIFAS: { CARRO: 150000, MOTO: 70000, BICICLETA: 30000 },   // valor sugerido de la mensualidad (COP)
  NOVEDADES_DIAS_DEFECTO: 30
};

const ROLES = {
  ADMIN: 'ADMINISTRADOR',
  OPERADOR: 'OPERADOR'
};

const ESTADOS = {
  CELDA: ['LIBRE', 'OCUPADA', 'MANTENIMIENTO'],
  MENSUALIDAD: ['ACTIVA', 'VENCIDA', 'CANCELADA'],
  REGISTRO: ['ABIERTO', 'CERRADO'],
  CLIENTE: ['ACTIVO', 'INACTIVO'],
  TIPO_VEHICULO: ['CARRO', 'MOTO', 'BICICLETA'],
  TIPO_DOCUMENTO: ['CC', 'CE', 'TI', 'PAS', 'NIT'],
  METODO_PAGO: ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'],
  TIPO_NOVEDAD: ['DAÑO', 'OBJETO OLVIDADO', 'INCIDENTE', 'OTRO']
};

/** Modelo relacional (MR). Novedad y Pago se crean desde ya para las iteraciones 2 y 3. */
const TABLAS = {
  rol: ['id_rol', 'nombre'],
  empleado: ['id_empleado', 'id_rol', 'nombres', 'apellidos', 'documento', 'username', 'password_hash', 'activo'],
  cliente: ['id_cliente', 'tipo_documento', 'numero_documento', 'nombres', 'apellidos', 'telefono', 'correo', 'direccion', 'estado', 'fecha_registro'],
  vehiculo: ['id_vehiculo', 'placa', 'tipo_vehiculo', 'marca', 'color', 'id_cliente'],
  celda: ['id_celda', 'codigo', 'tipo_vehiculo', 'zona', 'estado'],
  mensualidad: ['id_mensualidad', 'id_cliente', 'id_vehiculo', 'id_celda', 'fecha_inicio', 'fecha_fin', 'valor', 'estado'],
  registro_acceso: ['id_registro', 'id_vehiculo', 'id_celda', 'id_mensualidad', 'id_empleado_entrada', 'id_empleado_salida',
    'fecha_hora_entrada', 'fecha_hora_salida', 'estado', 'observaciones'],
  novedad: ['id_novedad', 'id_vehiculo', 'id_registro', 'id_empleado', 'tipo', 'descripcion', 'fecha_hora'],
  pago: ['id_pago', 'id_mensualidad', 'id_empleado', 'fecha_pago', 'valor', 'metodo_pago', 'referencia']
};

/** Formato de columnas de fecha en la hoja (solo presentación). */
const FORMATOS_FECHA = {
  cliente: { fecha_registro: 'yyyy-mm-dd hh:mm:ss' },
  mensualidad: { fecha_inicio: 'yyyy-mm-dd', fecha_fin: 'yyyy-mm-dd' },
  registro_acceso: { fecha_hora_entrada: 'yyyy-mm-dd hh:mm:ss', fecha_hora_salida: 'yyyy-mm-dd hh:mm:ss' },
  novedad: { fecha_hora: 'yyyy-mm-dd hh:mm:ss' },
  pago: { fecha_pago: 'yyyy-mm-dd hh:mm:ss' }
};
