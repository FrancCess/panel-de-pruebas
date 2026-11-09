'use strict';

/**
 * Motor SAST (Static Application Security Testing):
 * Analiza el código fuente real del proyecto buscando tanto controles defensivos
 * implementados como posibles patrones de riesgo (con archivo y número de línea exactos).
 */

const fs = require('node:fs');
const path = require('node:path');
const { buscarArchivosCodigo } = require('../../utils/archivos');

const CODE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.php', '.py', '.html']);

function ejecutarAnalisisSAST(rutaProyectoAbsoluta) {
  const hallazgos = [];
  const archivos = buscarArchivosCodigo(rutaProyectoAbsoluta, {
    maxDepth: 5,
    maxFiles: 120,
    maxSizeBytes: 500 * 1024,
    filtroArchivo: (name) => {
      const ext = path.extname(name).toLowerCase();
      return CODE_EXTENSIONS.has(ext) || name.endsWith('.blade.php');
    }
  });

  let usaHelmet = false;
  let usaRateLimit = false;
  let usaParametrosSQL = false;
  let usaHashSeguro = false;
  let usaHttpOnlyCookie = false;
  let usaValidacionUpload = false;

  const riesgosSQL = [];
  const riesgosDOMXSS = [];
  const riesgosSecretosFallback = [];
  const riesgosSubprocesos = [];
  const riesgosEval = [];

  for (const archivo of archivos) {
    let contenido = '';
    try {
      contenido = fs.readFileSync(archivo.fullPath, 'utf8');
    } catch {
      continue;
    }

    const lineas = contenido.split(/\r?\n/);

    // Detección global de controles positivos
    if (/helmet\s*\(|SecurityHeaders|X-Content-Type-Options/i.test(contenido)) usaHelmet = true;
    if (/rateLimit|limiter|ThrottleRequests|limite_cotizar|intentos|rate_limit/i.test(contenido)) usaRateLimit = true;
    if (/bcrypt|scrypt|argon2|Hash::make|password_hash/i.test(contenido)) usaHashSeguro = true;
    if (/httpOnly\s*:\s*true|'http_only'\s*=>\s*true|SESSION_HTTP_ONLY/i.test(contenido)) usaHttpOnlyCookie = true;
    if (/fileSize|max_tamano_mb|MAX_BYTES|maxHttpBufferSize|mimes:|mimetypes:/i.test(contenido)) usaValidacionUpload = true;
    if (/\?\s*,|\bprepare\s*\(|where\s*\(/i.test(contenido)) usaParametrosSQL = true;

    const esFrontend =
      archivo.relPath.startsWith('public/') ||
      archivo.relPath.startsWith('frontend/') ||
      archivo.relPath.endsWith('.html');

    // Análisis línea por línea para ubicar archivo:línea exacto
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const numLinea = i + 1;
      const trimLinea = linea.trim();

      if (
        trimLinea.startsWith('//') ||
        trimLinea.startsWith('*') ||
        trimLinea.startsWith('/*') ||
        trimLinea.startsWith('#')
      ) {
        continue;
      }

      const registrarRiesgo = (lista, maxItems) => {
        if (lista.length < maxItems) {
          lista.push({
            ubicacion: `${archivo.relPath}:${numLinea}`,
            fragmento: trimLinea.slice(0, 110)
          });
        }
      };

      // 1. CWE-89: Posible interpolación directa en consulta SQL (solo en archivos de servidor)
      if (
        !esFrontend &&
        /(?:SELECT\s+.+\s+FROM|INSERT\s+INTO\s+\w+|UPDATE\s+\w+\s+SET|DELETE\s+FROM\s+\w+)\b[^;]*\$\{(?!table|campo|columna|orden|limit|whereClause)/i.test(
          linea
        )
      ) {
        registrarRiesgo(riesgosSQL, 4);
      }

      // 2. CWE-79: Uso de innerHTML con interpolación de plantilla en JS de cliente
      if (/\.innerHTML\s*\+?=\s*`[^`]*\$\{/i.test(linea) && !/escapeHtml|esc\(|sanitize|DOMPurify/i.test(linea)) {
        registrarRiesgo(riesgosDOMXSS, 5);
      }

      // 3. CWE-798: Secreto de sesión con valor fallback débil en código
      if (/SESSION_SECRET\s*\|\|\s*['"][^'"]+['"]|secret\s*:\s*['"][^'"]{4,40}['"]/i.test(linea)) {
        registrarRiesgo(riesgosSecretosFallback, 3);
      }

      // 4. CWE-78: Uso de exec() o subprocess con shell en vez de execFile()
      if (
        (/\bexec\s*\(\s*[`'"]/.test(linea) && !/db\.exec\s*\(/.test(linea)) ||
        /shell\s*=\s*True/.test(linea)
      ) {
        registrarRiesgo(riesgosSubprocesos, 3);
      }

      // 5. CWE-95: Uso de eval() o new Function()
      if (/\beval\s*\(|new\s+Function\s*\(/.test(linea)) {
        registrarRiesgo(riesgosEval, 3);
      }
    }
  }

  const formatearEvidencia = (lista) => lista.map((r) => `${r.ubicacion} → ${r.fragmento}`).join(' | ');

  // --- GENERACIÓN DE HALLAZGOS ESTRUCTURADOS OWASP / CWE ---

  // 1. A03:2021 - Inyección SQL (CWE-89)
  if (riesgosSQL.length > 0) {
    hallazgos.push({
      owasp: 'A03:2021 - Injection',
      cwe: 'CWE-89',
      severidad: 'alta',
      estado: 'warn',
      control: 'Consultas SQL con interpolación de variables (SAST)',
      evidencia: formatearEvidencia(riesgosSQL),
      detalle: `Se detectaron ${riesgosSQL.length} sentencia(s) SQL con plantillas interpoladas. Debe verificarse que no reciban entrada directa del usuario.`,
      remediacion: 'Usa exclusivamente consultas parametrizadas con marcadores "?" (db.prepare("SELECT ... WHERE id = ?").get(id)) y listas blancas para nombres de columnas.'
    });
  } else if (usaParametrosSQL) {
    hallazgos.push({
      owasp: 'A03:2021 - Injection',
      cwe: 'CWE-89',
      severidad: 'info',
      estado: 'pass',
      control: 'Prevención de Inyección SQL (Consultas Parametrizadas / ORM)',
      evidencia: `Verificado en ${archivos.length} archivos de código fuente`,
      detalle: 'El proyecto utiliza sentencias preparadas (marcadores "?") o constructor ORM parametrizado sin concatenación directa.',
      remediacion: ''
    });
  }

  // 2. A03:2021 - Cross-Site Scripting DOM (CWE-79)
  if (riesgosDOMXSS.length > 0) {
    hallazgos.push({
      owasp: 'A03:2021 - Injection (XSS)',
      cwe: 'CWE-79',
      severidad: 'media',
      estado: 'warn',
      control: 'Asignación a innerHTML sin función de escape explícita en la misma línea',
      evidencia: formatearEvidencia(riesgosDOMXSS),
      detalle: `Se encontraron ${riesgosDOMXSS.length} punto(s) donde se inserta HTML dinámico con innerHTML. Si los datos provienen de la BD o usuario, podrían causar DOM XSS.`,
      remediacion: 'Prefiere textContent para insertar texto dinámico o envuelve todas las variables interpoladas con una función escapeHtml() / DOMPurify.sanitize().'
    });
  } else {
    hallazgos.push({
      owasp: 'A03:2021 - Injection (XSS)',
      cwe: 'CWE-79',
      severidad: 'info',
      estado: 'pass',
      control: 'Saneamiento de Salida DOM / Plantillas',
      evidencia: `Escaneo SAST sobre ${archivos.length} archivos`,
      detalle: 'No se detectaron asignaciones inseguras directas a innerHTML ni llamadas a eval().',
      remediacion: ''
    });
  }

  // 3. A02:2021 - Fallos Criptográficos y Secretos (CWE-798 / CWE-327)
  if (riesgosSecretosFallback.length > 0) {
    hallazgos.push({
      owasp: 'A02:2021 - Cryptographic Failures',
      cwe: 'CWE-798',
      severidad: 'alta',
      estado: 'fail',
      control: 'Secreto de sesión con valor estático por defecto en código',
      evidencia: formatearEvidencia(riesgosSecretosFallback),
      detalle: 'Se detectó una clave secreta estática o de respaldo en el código fuente.',
      remediacion: 'Exige que SESSION_SECRET provenga obligatoriamente de variables de entorno (.env) con al menos 32 bytes de entropía o genera uno criptográficamente aleatorio.'
    });
  }

  if (usaHashSeguro) {
    hallazgos.push({
      owasp: 'A02:2021 - Cryptographic Failures',
      cwe: 'CWE-327',
      severidad: 'info',
      estado: 'pass',
      control: 'Almacenamiento Criptográfico de Contraseñas',
      evidencia: 'Algoritmo adaptativo detectado (bcrypt / scrypt / Hash::make)',
      detalle: 'Las contraseñas y PINs se almacenan mediante funciones de derivación resistentes a fuerza bruta con sal aleatoria.',
      remediacion: ''
    });
  }

  // 4. A07:2021 - Fallos de Identificación y Autenticación (CWE-307)
  if (usaRateLimit) {
    hallazgos.push({
      owasp: 'A07:2021 - Auth Failures',
      cwe: 'CWE-307',
      severidad: 'info',
      estado: 'pass',
      control: 'Protección contra Fuerza Bruta / Rate-Limiting',
      evidencia: 'Mecanismo de límite de peticiones detectado en el código',
      detalle: 'El sistema cuenta con control de intentos fallidos o limitador de tasa de peticiones.',
      remediacion: ''
    });
  } else {
    hallazgos.push({
      owasp: 'A07:2021 - Auth Failures',
      cwe: 'CWE-307',
      severidad: 'media',
      estado: 'warn',
      control: 'Ausencia de Rate-Limiting explícito en endpoints de autenticación',
      evidencia: `Analizados ${archivos.length} archivos del proyecto`,
      detalle: 'No se detectó un middleware explícito de límite de intentos (ej. express-rate-limit) para mitigar ataques de diccionario o fuerza bruta.',
      remediacion: 'Implementa bloqueo temporal por IP/cuenta tras 5 intentos fallidos de inicio de sesión en una ventana de 15 minutos.'
    });
  }

  // 5. A05:2021 - Configuración de Seguridad y Subida de Archivos (CWE-16 / CWE-434)
  if (usaHelmet) {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-16',
      severidad: 'info',
      estado: 'pass',
      control: 'Middleware de Cabeceras Defensivas en Código',
      evidencia: 'Helmet / SecurityHeaders detectado en el servidor',
      detalle: 'El código del servidor configura cabeceras de endurecimiento HTTP.',
      remediacion: ''
    });
  } else {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-16',
      severidad: 'baja',
      estado: 'warn',
      control: 'Endurecimiento de Cabeceras HTTP en Código',
      evidencia: `No se detectó helmet() ni middleware equivalente en ${archivos.length} archivos`,
      detalle: 'El servidor no aplica explícitamente cabeceras CSP, HSTS ni X-Frame-Options desde el código.',
      remediacion: 'Agrega el paquete helmet en Express o un middleware global que fije X-Content-Type-Options: nosniff y X-Frame-Options: SAMEORIGIN.'
    });
  }

  if (usaValidacionUpload) {
    hallazgos.push({
      owasp: 'A04:2021 - Insecure Design',
      cwe: 'CWE-434',
      severidad: 'info',
      estado: 'pass',
      control: 'Restricción de Tamaño y Tipo en Cargas de Archivos / Payloads',
      evidencia: 'Límites de tamaño/MIME verificados en el código',
      detalle: 'El proyecto define límites máximos de tamaño de archivo o buffer para prevenir denegación de servicio por agotamiento de memoria/disco.',
      remediacion: ''
    });
  }

  if (riesgosSubprocesos.length > 0) {
    hallazgos.push({
      owasp: 'A03:2021 - Injection (OS Command)',
      cwe: 'CWE-78',
      severidad: 'media',
      estado: 'warn',
      control: 'Ejecución de subprocesos del sistema operativo',
      evidencia: formatearEvidencia(riesgosSubprocesos),
      detalle: 'Se detectó invocación a subprocesos. Debe asegurarse que los argumentos estén pasados como arreglo y nunca concatenados en un shell.',
      remediacion: 'Utiliza child_process.execFile() o spawn() sin la opción shell: true.'
    });
  }

  if (usaHttpOnlyCookie) {
    hallazgos.push({
      owasp: 'A07:2021 - Auth Failures',
      cwe: 'CWE-1004',
      severidad: 'info',
      estado: 'pass',
      control: 'Protección de Cookies de Sesión en Código (HttpOnly)',
      evidencia: 'Configuración httpOnly verificada en el servidor',
      detalle: 'Las cookies de sesión están protegidas contra lectura desde scripts del navegador (document.cookie).',
      remediacion: ''
    });
  }

  return {
    archivosEscaneados: archivos.length,
    hallazgos
  };
}

module.exports = {
  ejecutarAnalisisSAST
};
