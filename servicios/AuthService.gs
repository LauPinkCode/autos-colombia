/**
 * AuthService – HU-01 / RF-11 / RNF-02.
 * - Contraseñas: derivación HMAC-SHA256 iterada con sal aleatoria.
 * - Sesión: token JWT HS256 firmado con un secreto guardado en Script Properties, expira a las 8 h.
 * - Control de acceso por rol (ADMINISTRADOR / OPERADOR).
 */
const AuthService = {

  hashPassword(password, sal, iteraciones) {
    sal = sal || Utilities.getUuid().replace(/-/g, '');
    iteraciones = iteraciones || CONFIG.HASH_ITERACIONES;
    const clave = Utilities.newBlob(sal).getBytes();
    const pwd = Utilities.newBlob(String(password)).getBytes();
    let h = Utilities.computeHmacSha256Signature(pwd, clave);
    for (let i = 1; i < iteraciones; i++) {
      h = Utilities.computeHmacSha256Signature(h.concat(pwd), clave);
    }
    return ['h1', iteraciones, sal, Utilities.base64Encode(h)].join('$');
  },

  verificarPassword(password, almacenado) {
    const partes = String(almacenado || '').split('$');
    if (partes.length !== 4 || partes[0] !== 'h1') return false;
    return igualSeguro_(this.hashPassword(password, partes[2], Number(partes[1])), almacenado);
  },

  /** HU-01: CA1 credenciales válidas, CA2 mensaje genérico, CA3 empleado inactivo. */
  login(username, password) {
    const usuario = texto_(username, 40).toLowerCase();
    if (!usuario || !password) throw new ErrorNegocio(400, 'Digite usuario y contraseña');

    const cache = CacheService.getScriptCache();
    const claveIntentos = 'login_fail_' + usuario;
    const intentos = Number(cache.get(claveIntentos) || 0);
    if (intentos >= CONFIG.LOGIN_MAX_INTENTOS) {
      throw new ErrorNegocio(429, 'Demasiados intentos fallidos. Intente de nuevo en ' + CONFIG.LOGIN_BLOQUEO_MIN + ' minutos.');
    }

    const emp = Db.buscarUno('empleado', e => String(e.username).toLowerCase() === usuario);
    if (!emp || !this.verificarPassword(password, emp.password_hash)) {
      cache.put(claveIntentos, String(intentos + 1), CONFIG.LOGIN_BLOQUEO_MIN * 60);
      throw new ErrorNegocio(401, 'Usuario o contraseña incorrectos');
    }
    if (!esVerdadero_(emp.activo)) throw new ErrorNegocio(403, 'El usuario está inactivo. Contacte al administrador.');
    cache.remove(claveIntentos);

    const ahora = Math.floor(Date.now() / 1000);
    const token = firmarJwt_({ sub: Number(emp.id_empleado), iat: ahora, exp: ahora + CONFIG.TOKEN_HORAS * 3600 });
    return { token, empleado: this.dto_(emp) };
  },

  /** Valida el token y devuelve el empleado vigente. Lanza 401 si expiró o fue alterado. */
  verificar(token) {
    const payload = verificarJwt_(token);
    if (!payload) throw new ErrorNegocio(401, 'Su sesión expiró o no es válida. Inicie sesión nuevamente.');
    const emp = Db.porId('empleado', payload.sub);
    if (!emp || !esVerdadero_(emp.activo)) throw new ErrorNegocio(401, 'Usuario no autorizado. Inicie sesión nuevamente.');
    return Object.assign(this.dto_(emp), { exp: payload.exp });
  },

  dto_(emp) {
    const rol = Db.porId('rol', emp.id_rol);
    return {
      id_empleado: Number(emp.id_empleado),
      nombre: (emp.nombres + ' ' + emp.apellidos).trim(),
      username: emp.username,
      rol: rol ? rol.nombre : ''
    };
  }
};

function igualSeguro_(a, b) {
  a = String(a); b = String(b);
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function secretoJwt_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('JWT_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('JWT_SECRET', s);
  }
  return s;
}

function b64url_(datos) {
  const bytes = typeof datos === 'string' ? Utilities.newBlob(datos).getBytes() : datos;
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function b64urlDecodificar_(s) {
  const relleno = '===='.substring(0, (4 - s.length % 4) % 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s + relleno)).getDataAsString();
}

function firmarJwt_(payload) {
  const cuerpo = b64url_(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + b64url_(JSON.stringify(payload));
  return cuerpo + '.' + b64url_(Utilities.computeHmacSha256Signature(cuerpo, secretoJwt_()));
}

function verificarJwt_(token) {
  try {
    const partes = String(token || '').split('.');
    if (partes.length !== 3) return null;
    const cuerpo = partes[0] + '.' + partes[1];
    const firma = b64url_(Utilities.computeHmacSha256Signature(cuerpo, secretoJwt_()));
    if (!igualSeguro_(firma, partes[2])) return null;
    const payload = JSON.parse(b64urlDecodificar_(partes[1]));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}
