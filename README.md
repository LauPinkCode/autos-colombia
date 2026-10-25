# Autos Colombia – Sistema de gestión de parqueadero (Google Apps Script)

Sistema completo del parqueadero "Autos Colombia":

| Iteración | Alcance |
|-----------|---------|
| 1 | Entrada y salida de vehículos, panel con mapa de celdas, historial, reportes y login por roles |
| 2 | Gestión de clientes y vehículos, celdas, empleados y novedades |
| 3 | Gestión de pagos de mensualidades y cartera |

Todo el proyecto está escrito en **JavaScript** y se aloja y ejecuta en **Google Apps Script**.

## Tecnologías

| Aspecto            | Herramienta                                              |
|--------------------|----------------------------------------------------------|
| Lenguaje           | JavaScript (motor V8 de Apps Script)                     |
| Backend            | Google Apps Script (archivos `.gs`)                      |
| Frontend           | HtmlService de Apps Script (HTML + CSS + JavaScript)     |
| Base de datos      | Google Sheets (una hoja por tabla)                       |
| Pruebas            | `runTests()` en JavaScript, ejecutado desde el editor    |
| Respaldos          | Disparador diario de Apps Script → copia en Google Drive |
| Publicación        | Implementación como aplicación web de Apps Script        |
| Control de versiones | Versiones de implementación de Apps Script (Implementar → Gestionar implementaciones) |

## Estructura del proyecto

```
autos-colombia-appscript/
├── appsscript.json            Manifiesto (zona horaria America/Bogota, V8, aplicación web)
├── config/
│   ├── Config.gs              Constantes, tarifas, roles, estados y esquema de tablas
│   └── Util.gs                Fechas, periodos mensuales, placas, validaciones, errores, bloqueo
├── datos/
│   └── Db.gs                  Repositorio genérico sobre Google Sheets
├── servicios/
│   ├── AuthService.gs         Login, hash de contraseñas, token de sesión, roles
│   ├── AccesoService.gs       Entradas, salidas y vehículos presentes (RN-01 a RN-07)
│   ├── CeldaService.gs        Disponibilidad, mapa y administración de celdas
│   ├── ReporteService.gs      Historial y reporte por rango de fechas
│   ├── ClienteService.gs      Clientes y vehículos (iteración 2)
│   ├── EmpleadoService.gs     Empleados, roles y contraseñas (iteración 2)
│   ├── NovedadService.gs      Novedades por vehículo (iteración 2)
│   └── PagoService.gs         Pagos, renovación de mensualidades y cartera (iteración 3)
├── api/
│   └── Api.gs                 doGet() y funciones api* que llama el navegador
├── admin/
│   ├── Setup.gs               Instalación, datos iniciales y menú de la hoja
│   └── Backup.gs              Respaldo diario con retención de 30 días
├── pruebas/
│   └── Tests.gs               28 pruebas automatizadas
└── vistas/
    ├── Index.html             Estructura de todas las pantallas
    ├── Estilos.html           Estilos (amarillo de placa, tinta negra, blanco)
    ├── App.html               JavaScript del navegador: sesión, panel, entrada, salida, historial, reportes
    └── Gestion.html           JavaScript del navegador: clientes, celdas, empleados, novedades, pagos
```

Las dependencias van en una sola dirección: `api` → `servicios` → `datos` → Google Sheets.

## Instalación en Apps Script

1. Cree una hoja de cálculo nueva en Google Drive con el nombre "Autos Colombia - Base de datos".
2. Abra **Extensiones → Apps Script**.
3. Borre el archivo `Código.gs` que viene por defecto.
4. Cree cada archivo con **+** y escriba el nombre **con su carpeta**. Apps Script muestra la
   barra `/` como carpeta.
   - **Secuencia de comandos:** `config/Config`, `config/Util`, `datos/Db`, `servicios/AuthService`,
     `servicios/AccesoService`, `servicios/CeldaService`, `servicios/ReporteService`,
     `servicios/ClienteService`, `servicios/EmpleadoService`, `servicios/NovedadService`,
     `servicios/PagoService`, `api/Api`, `admin/Setup`, `admin/Backup`, `pruebas/Tests`
   - **HTML:** `vistas/Index`, `vistas/Estilos`, `vistas/App`, `vistas/Gestion`
5. Pegue en cada archivo el contenido correspondiente.
6. En ⚙️ **Configuración del proyecto**, active "Mostrar el archivo de manifiesto appsscript.json"
   y reemplace su contenido con el de `appsscript.json`.
7. Seleccione la función `setup` y pulse **Ejecutar**. Autorice los permisos. Esto:
   - crea las 9 hojas (rol, empleado, cliente, vehiculo, celda, mensualidad, registro_acceso, novedad, pago),
   - carga datos de demostración y dos usuarios iniciales,
   - genera el secreto de los tokens y programa el respaldo diario.
8. Seleccione `runTests` y pulse **Ejecutar**. El registro de ejecución debe mostrar **28 / 28 pruebas OK**.
9. Abra **Implementar → Nueva implementación → Aplicación web**.
   - En "Ejecutar como" elija *Yo*. En "Quién tiene acceso" elija *Cualquier persona*.
   - Abra la URL que entrega Google: esa es la aplicación.
10. Entre como administrador y cambie las contraseñas iniciales en **Empleados**.

> Si cambia el código, publique una versión nueva en **Implementar → Gestionar implementaciones →
> Editar → Versión nueva**. Así la URL no cambia y cada versión queda registrada.

### Usuarios iniciales (cámbielos de inmediato en Empleados)

| Usuario    | Contraseña      | Rol           |
|------------|-----------------|---------------|
| `admin`    | `Admin2026*`    | ADMINISTRADOR |
| `operador` | `Operador2026*` | OPERADOR      |

### Placas de demostración

| Placa    | Escenario                                            |
|----------|------------------------------------------------------|
| `ABC123` | Mensualidad vigente → entrada permitida (celda A-01) |
| `XYZ789` | Vigente, vence en 3 días → alerta y aparece en cartera como "por vencer" |
| `MOT45E` | Moto vigente (celda M-01)                            |
| `OLD999` | Mensualidad vencida → bloqueada; al registrar un pago queda habilitada |
| `CAN111` | Mensualidad cancelada → bloqueada                    |
| `SIN000` | Sin mensualidad → bloqueada                          |
| `DEF456` | Celda asignada en mantenimiento → bloqueada          |
| `NOX000` | No registrada → "Vehículo no registrado"             |

## Pantallas y permisos

| Pantalla | Operador | Administrador | Qué hace |
|----------|:--------:|:-------------:|----------|
| Panel | ✔ | ✔ | Ocupación, mapa de celdas y vehículos presentes |
| Registrar entrada / salida | ✔ | ✔ | Control de acceso por placa |
| Novedades | ✔ | ✔ | Daños, objetos olvidados e incidentes; se asocian a la entrada abierta |
| Clientes | | ✔ | Crear y editar clientes, activarlos o desactivarlos, agregar y editar sus vehículos |
| Celdas | | ✔ | Crear celdas, cambiar zona o tipo, marcarlas en mantenimiento |
| Pagos | | ✔ | Registrar pagos, cartera de vencidas/por vencer y pagos recibidos con totales |
| Empleados | | ✔ | Crear cuentas, cambiar rol, activar o desactivar y restablecer contraseñas |
| Historial / Reportes | | ✔ | Auditoría de movimientos y reporte por día |

## Reglas de las iteraciones 2 y 3

| Regla | Cómo se cumple |
|-------|----------------|
| Documento de cliente, placa, código de celda y usuario de empleado únicos | Se verifica en el servicio antes de guardar (409 si se repite) |
| No se eliminan registros | Clientes y empleados se desactivan; las celdas pasan a mantenimiento |
| Un cliente INACTIVO no puede ingresar ni pagar | `AccesoService.evaluarEntrada_` y `PagoService.registrar` |
| El estado OCUPADA solo cambia con entradas y salidas | `CeldaService.guardar` solo alterna LIBRE ↔ MANTENIMIENTO y bloquea cambios en celdas ocupadas |
| Una celda pertenece a un solo vehículo por periodo | `PagoService.celdaReservadaPor_` rechaza celdas asignadas a otra mensualidad vigente |
| La celda debe ser del mismo tipo que el vehículo | `PagoService.registrar` |
| Cada pago renueva la mensualidad por un mes | Si está vigente, el periodo nuevo empieza al día siguiente del vencimiento; si no, empieza hoy |
| Siempre queda un administrador activo | `EmpleadoService.guardar`; además nadie puede desactivarse ni quitarse el rol a sí mismo |
| Toda operación queda registrada con su empleado | Pagos, novedades, entradas y salidas guardan el empleado y la fecha |

## Trazabilidad de requisitos (iteración 1)

| Requisito | Cómo se cumple |
|-----------|----------------|
| RN-01 / RF-03 | `AccesoService.evaluarEntrada_`: mensualidad `ACTIVA` y fecha de hoy entre inicio y fin |
| RN-02 | La celda se toma siempre de la mensualidad vigente |
| RN-03 / RF-05 | Se verifica que no haya registro `ABIERTO`, dentro de un `LockService` para evitar registros simultáneos |
| RN-04 / RF-07 | `registrarSalida` exige una entrada abierta |
| RN-05 / RF-04 | Al entrar la celda pasa a `OCUPADA`; al salir pasa a `LIBRE` |
| RN-06 / RF-12 / RNF-11 | Cada registro guarda el empleado de entrada y de salida y la hora del servidor (America/Bogota) |
| RN-07 | `normalizarPlaca_`: mayúsculas, sin espacios ni guiones |
| RF-01, RF-02 / HU-02 | Pantalla "Registrar entrada" con propietario, vehículo, mensualidad y celda |
| HU-03 CA3 | Alerta cuando faltan 5 días o menos para el vencimiento |
| RF-06 / HU-04 | Pantalla "Registrar salida" con hora de entrada y tiempo transcurrido |
| RF-08 / HU-05 | Panel de vehículos presentes con búsqueda por placa; se actualiza cada 30 s sin recargar |
| RF-10 / HU-06 | Tarjetas de celdas libres/ocupadas, entradas/salidas de hoy y mapa de celdas con la placa de cada vehículo; tocar una celda ocupada abre su salida |
| RF-09 / HU-07 | Historial con filtros (fechas, placa, estado), empleados y exportación CSV |
| RF-13 / HU-08 | Reporte por día: entradas, salidas y permanencia promedio (solo administrador) |
| RF-11 / HU-01 | Login con usuario y contraseña, mensaje genérico de error, inactivos bloqueados, roles |
| RNF-02 | Token firmado HS256 que expira a las 8 h; contraseñas con HMAC-SHA256 iterado y sal; bloqueo tras 5 intentos fallidos |
| RNF-03 | Solo se guardan los datos necesarios; la hoja es privada del propietario; aviso de la Ley 1581 en el login |
| RNF-04 | Entrada o salida en 3 interacciones: placa → Buscar (Enter) → Confirmar (con foco automático) |
| RNF-05 | Alojado en la infraestructura de Google Apps Script |
| RNF-06 | Validación de estados, placas y fechas en los servicios; los textos se guardan protegidos contra fórmulas |
| RNF-07 | `admin/Backup.gs`: copia diaria a Google Drive con retención de 30 días |
| RNF-08 | Código organizado por capas y `runTests()` con 28 casos |
| RNF-09 | Diseño adaptable a escritorio, tableta y celular |
| RNF-10 | Las iteraciones 2 y 3 se agregaron como servicios nuevos en `servicios/` sin cambiar la lógica de entradas y salidas |

## Notas

- Google Sheets no tiene llaves foráneas, restricciones `CHECK` ni índices únicos. Esas reglas se
  validan en la capa `servicios/`, y todas las escrituras pasan por `LockService`.
- Las tarifas sugeridas de la mensualidad están en `CONFIG.TARIFAS` (`config/Config.gs`); el valor
  se puede ajustar en cada pago.
- El historial (HU-07) es solo para el administrador, como indica la historia. Para habilitarlo al
  operador, cambie `[ROLES.ADMIN]` por `null` en `apiHistorial` (`api/Api.gs`).
