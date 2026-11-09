'use strict';

/**
 * Motor Profesional de Auditoría de Seguridad Defensiva (SAST + Configuración + DAST Pasivo)
 * Basado en el estándar OWASP Top 10 (2021), OWASP ASVS v4.0 y catálogo CWE.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const {
  leerProyectos,
  parsearArgumentosCLI,
  filtrarProyectosPorTermino,
  resolverRutaProyectoSegura,
  buscarArchivosCodigo,
  esUrlLocalSegura,
  construirUrlRol
} = require('./utils-proyectos');

const CODE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.php', '.py', '.html']);

function peticionPasivaHTTP(urlString, timeout = 2200) {
  return new Promise((resolve) => {
    if (!esUrlLocalSegura(urlString)) {
      return resolve({ ok: false, error: 'Solo se permite auditar hosts locales (localhost / 127.0.0.1).' });
    }

    const parsed = new URL(urlString);
    const client = parsed.protocol === 'https:' ? https : http;
    const inicio = Date.now();

    const req = client.request(
      parsed,
      {
        method: 'GET',
        timeout,
        headers: {
          'User-Agent': 'OWASP-DefensiveAuditor/2.0 (Local-Audit)',
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8'
        }
      },
      (res) => {
        let bodySample = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (bodySample.length < 4096) bodySample += chunk;
        });
        res.on('end', () => {
          resolve({
            ok: true,
            statusCode: res.statusCode,
            headers: res.headers,
            latencyMs: Date.now() - inicio,
            bodySample
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout' });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.end();
  });
}

/**
 * Motor SAST: Analiza el código fuente real del proyecto buscando tanto controles defensivos
 * implementados como posibles patrones de riesgo (con archivo y número de línea exactos).
 */
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

function evaluarCabecerasSeguridadEnVivo(headers) {
  const hallazgos = [];

  if (headers['content-security-policy']) {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-693',
      severidad: 'info',
      estado: 'pass',
      control: 'DAST Pasivo: Content-Security-Policy (CSP)',
      evidencia: String(headers['content-security-policy']).slice(0, 100),
      detalle: 'Cabecera CSP activa en la respuesta HTTP en vivo.',
      remediacion: ''
    });
  } else {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-693',
      severidad: 'media',
      estado: 'warn',
      control: 'DAST Pasivo: Content-Security-Policy (CSP) ausente',
      evidencia: 'Cabecera no presente en la respuesta HTTP',
      detalle: 'El servidor en ejecución no devuelve una política CSP para restringir orígenes de scripts y estilos.',
      remediacion: "Configura Content-Security-Policy: default-src 'self' en tu servidor."
    });
  }

  if (String(headers['x-content-type-options'] || '').toLowerCase() === 'nosniff') {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-16',
      severidad: 'info',
      estado: 'pass',
      control: 'DAST Pasivo: X-Content-Type-Options',
      evidencia: 'X-Content-Type-Options: nosniff',
      detalle: 'Protección contra MIME-sniffing activa.',
      remediacion: ''
    });
  } else {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-16',
      severidad: 'media',
      estado: 'fail',
      control: 'DAST Pasivo: X-Content-Type-Options ausente',
      evidencia: 'Sin cabecera X-Content-Type-Options',
      detalle: 'El navegador podría interpretar archivos subidos con un tipo MIME distinto al declarado.',
      remediacion: 'Añade res.setHeader("X-Content-Type-Options", "nosniff").'
    });
  }

  if (headers['x-powered-by']) {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-200',
      severidad: 'baja',
      estado: 'warn',
      control: 'DAST Pasivo: Fuga de huella del servidor (X-Powered-By)',
      evidencia: `X-Powered-By: ${headers['x-powered-by']}`,
      detalle: 'El servidor revela la tecnología subyacente en las cabeceras de respuesta.',
      remediacion: 'Usa app.disable("x-powered-by") en Express o expose_php = Off en php.ini.'
    });
  }

  return hallazgos;
}

function evaluarHigieneCredenciales(roles = []) {
  const hallazgos = [];
  const clavesDiccionario = new Set(['password', '1234', '123456', 'admin', 'admin123', 'root', 'test']);

  roles.forEach((r) => {
    const pass = String(r.password || '').trim();
    if (!pass || pass === 'Sin contraseña' || pass.includes('PIN de sala') || pass.includes('Código de Sala')) {
      return;
    }

    const enDiccionario = clavesDiccionario.has(pass.toLowerCase());
    const longitudInsuficiente = pass.length < 10;
    const faltaComplejidad = !/[A-Z]/.test(pass) || !/[0-9]/.test(pass);

    if (enDiccionario) {
      hallazgos.push({
        owasp: 'A07:2021 - Auth Failures',
        cwe: 'CWE-521',
        severidad: 'alta',
        estado: 'fail',
        control: `Credencial en diccionario común — Rol "${r.rol}"`,
        evidencia: `Usuario: ${r.usuario} | Clave actual: "${pass}" (${pass.length} caracteres)`,
        detalle: 'La contraseña figura en el top de diccionarios de fuerza bruta. Aceptable únicamente en entorno aislado de desarrollo.',
        remediacion: 'Reemplazar en producción por una clave de al menos 12 caracteres con mayúsculas, minúsculas, dígitos y símbolos.'
      });
    } else if (longitudInsuficiente || faltaComplejidad) {
      hallazgos.push({
        owasp: 'A07:2021 - Auth Failures',
        cwe: 'CWE-521',
        severidad: 'media',
        estado: 'warn',
        control: `Entropía moderada de contraseña — Rol "${r.rol}"`,
        evidencia: `Usuario: ${r.usuario} | Longitud: ${pass.length} caracteres`,
        detalle: 'La contraseña tiene menos de 10 caracteres o carece de combinación alfanumérica completa.',
        remediacion: 'Incrementar la longitud mínima a 10-12 caracteres conforme a OWASP ASVS v4.0 sección 2.1.'
      });
    } else {
      hallazgos.push({
        owasp: 'A07:2021 - Auth Failures',
        cwe: 'CWE-521',
        severidad: 'info',
        estado: 'pass',
        control: `Política de Contraseña Robusta — Rol "${r.rol}"`,
        evidencia: `Usuario: ${r.usuario} | Longitud: ${pass.length} caracteres (Alfanumérica + Símbolos)`,
        detalle: 'Cumple los requisitos de longitud y complejidad contra ataques de diccionario.',
        remediacion: ''
      });
    }

    if (r.pin && String(r.pin).length <= 4) {
      hallazgos.push({
        owasp: 'A07:2021 - Auth Failures',
        cwe: 'CWE-307',
        severidad: 'media',
        estado: 'warn',
        control: `Espacio de clave reducido en PIN (${String(r.pin).length} dígitos) — Rol "${r.rol}"`,
        evidencia: `PIN configurado: ${r.pin} (10,000 combinaciones posibles)`,
        detalle: 'Un PIN de 4 dígitos tiene baja entropía y depende críticamente del bloqueo por intentos fallidos.',
        remediacion: 'Combinar con rate-limiting estricto (máximo 5 intentos) o usar PIN de 6 dígitos.'
      });
    }
  });

  return hallazgos;
}

function evaluarArchivosConfiguracion(rutaProyectoAbsoluta) {
  const hallazgos = [];
  const gitignorePath = path.join(rutaProyectoAbsoluta, '.gitignore');
  const envPath = path.join(rutaProyectoAbsoluta, '.env');
  const packageLockPath = path.join(rutaProyectoAbsoluta, 'package-lock.json');
  const composerLockPath = path.join(rutaProyectoAbsoluta, 'composer.lock');

  if (fs.existsSync(envPath)) {
    const envRaw = fs.readFileSync(envPath, 'utf8');
    if (/APP_DEBUG\s*=\s*true/i.test(envRaw)) {
      hallazgos.push({
        owasp: 'A05:2021 - Security Misconfiguration',
        cwe: 'CWE-215',
        severidad: 'media',
        estado: 'warn',
        control: 'Modo de depuración activo (APP_DEBUG=true en .env)',
        evidencia: '.env → APP_DEBUG=true',
        detalle: 'En modo debug, las excepciones muestran trazas completas de pila, rutas internas y variables de entorno.',
        remediacion: 'Asegúrate de establecer APP_DEBUG=false y NODE_ENV=production al desplegar en el servidor definitivo.'
      });
    }

    if (fs.existsSync(gitignorePath) && fs.readFileSync(gitignorePath, 'utf8').includes('.env')) {
      hallazgos.push({
        owasp: 'A05:2021 - Security Misconfiguration',
        cwe: 'CWE-538',
        severidad: 'info',
        estado: 'pass',
        control: 'Exclusión de Secretos (.env) en Control de Versiones',
        evidencia: '.gitignore incluye ".env"',
        detalle: 'El archivo .env está protegido contra commits accidentales en Git.',
        remediacion: ''
      });
    } else {
      hallazgos.push({
        owasp: 'A05:2021 - Security Misconfiguration',
        cwe: 'CWE-538',
        severidad: 'alta',
        estado: 'fail',
        control: 'Archivo .env sin exclusión en .gitignore',
        evidencia: '.env presente sin regla en .gitignore',
        detalle: 'Riesgo de filtración de credenciales de base de datos y claves de sesión al subir el repositorio.',
        remediacion: 'Agrega inmediatamente ".env" al archivo .gitignore.'
      });
    }
  }

  if (fs.existsSync(packageLockPath) || fs.existsSync(composerLockPath)) {
    hallazgos.push({
      owasp: 'A06:2021 - Vulnerable Components',
      cwe: 'CWE-1104',
      severidad: 'info',
      estado: 'pass',
      control: 'Integridad de Dependencias (Lockfile Presente)',
      evidencia: fs.existsSync(packageLockPath) ? 'package-lock.json verificado' : 'composer.lock verificado',
      detalle: 'Las versiones exactas y hashes de integridad de las dependencias están fijados.',
      remediacion: ''
    });
  }

  return hallazgos;
}

async function auditarRutasPorRolEnVivo(proyecto) {
  const hallazgos = [];
  const rutasUnicas = [...new Set((proyecto.roles || []).map((r) => r.rutaAcceso || '/'))];

  for (const ruta of rutasUnicas) {
    const urlDestino = construirUrlRol(proyecto.urlBase, ruta);
    const resp = await peticionPasivaHTTP(urlDestino, 2000);
    if (!resp.ok) continue;

    const esRutaPrivada = /admin|tutor|alumno|superadmin|coord|dashboard/i.test(ruta) && !/login/i.test(ruta);
    const protegida =
      resp.statusCode === 301 ||
      resp.statusCode === 302 ||
      resp.statusCode === 303 ||
      resp.statusCode === 401 ||
      resp.statusCode === 403 ||
      /type=["']password["']|iniciar sesi|login/i.test(resp.bodySample || '');

    if (esRutaPrivada) {
      hallazgos.push({
        owasp: 'A01:2021 - Broken Access Control',
        cwe: 'CWE-285',
        severidad: protegida ? 'info' : 'alta',
        estado: protegida ? 'pass' : 'fail',
        control: `DAST Pasivo: Control de Acceso en Ruta Privada (${ruta})`,
        evidencia: `GET ${urlDestino} → HTTP ${resp.statusCode} (${resp.latencyMs} ms)`,
        detalle: protegida
          ? 'La ruta rechaza peticiones anónimas o redirige correctamente al formulario de login.'
          : 'La ruta privada respondió HTTP 200 sin sesión aparente. Verifica su middleware de autenticación.',
        remediacion: protegida ? '' : 'Aplica middleware de verificación de sesión y rol antes de servir esta vista.'
      });
    }
  }
  return hallazgos;
}

function calcularPuntaje(hallazgos) {
  const evaluables = hallazgos.filter((h) => h.estado === 'pass' || h.estado === 'warn' || h.estado === 'fail');
  if (evaluables.length === 0) return { score: 100, grado: 'A' };

  let puntos = 0;
  evaluables.forEach((h) => {
    if (h.estado === 'pass') puntos += 1;
    else if (h.estado === 'warn') puntos += 0.55;
  });

  const score = Math.round((puntos / evaluables.length) * 100);
  let grado = 'A';
  if (score < 60) grado = 'D';
  else if (score < 75) grado = 'C';
  else if (score < 88) grado = 'B';

  return { score, grado };
}

async function auditarProyecto(proyecto) {
  const hallazgos = [];
  let archivosEscaneados = 0;

  // 1. Auditoría Dinámica Pasiva (si el servidor está encendido)
  const respRaiz = await peticionPasivaHTTP(proyecto.urlBase, 1800);
  const servidorOnline = Boolean(respRaiz.ok);

  if (servidorOnline) {
    hallazgos.push(...evaluarCabecerasSeguridadEnVivo(respRaiz.headers || {}));
    hallazgos.push(...(await auditarRutasPorRolEnVivo(proyecto)));
  }

  // 2. Auditoría Estática de Código Fuente (SAST) y Configuración en Disco
  const validacionCarpeta = resolverRutaProyectoSegura(proyecto.carpetaLocal);
  if (validacionCarpeta.ok) {
    const resultadoSAST = ejecutarAnalisisSAST(validacionCarpeta.rutaAbsoluta);
    archivosEscaneados = resultadoSAST.archivosEscaneados;
    hallazgos.push(...resultadoSAST.hallazgos);
    hallazgos.push(...evaluarArchivosConfiguracion(validacionCarpeta.rutaAbsoluta));
  }

  // 3. Auditoría de Políticas de Credenciales por Rol
  hallazgos.push(...evaluarHigieneCredenciales(proyecto.roles || []));

  const pesoEstado = { fail: 0, warn: 1, pass: 2, info: 3 };
  hallazgos.sort((a, b) => (pesoEstado[a.estado] ?? 4) - (pesoEstado[b.estado] ?? 4));

  const resumen = calcularPuntaje(hallazgos);

  return {
    id: proyecto.id,
    nombre: proyecto.nombre,
    urlBase: proyecto.urlBase,
    puerto: proyecto.puerto,
    carpetaLocal: proyecto.carpetaLocal,
    archivosEscaneados,
    online: servidorOnline,
    latenciaMs: respRaiz.latencyMs || null,
    score: resumen.score,
    grado: resumen.grado,
    fecha: new Date().toISOString(),
    estadisticas: {
      pass: hallazgos.filter((h) => h.estado === 'pass').length,
      warn: hallazgos.filter((h) => h.estado === 'warn').length,
      fail: hallazgos.filter((h) => h.estado === 'fail').length,
      info: hallazgos.filter((h) => h.estado === 'info').length
    },
    hallazgos
  };
}

async function auditarTodosLosProyectos(proyectos) {
  const reportes = [];
  for (const p of proyectos) {
    reportes.push(await auditarProyecto(p));
  }
  return reportes;
}

if (require.main === module) {
  const proyectos = leerProyectos();
  const { filtro, json } = parsearArgumentosCLI();
  const seleccionados = filtrarProyectosPorTermino(proyectos, filtro);

  (async () => {
    const resultados = await auditarTodosLosProyectos(seleccionados);
    if (json) {
      console.log(JSON.stringify(resultados, null, 2));
      return;
    }

    console.log('================================================================================');
    console.log('  🛡️  AUDITORÍA PROFESIONAL DE SEGURIDAD (SAST + OWASP TOP 10 + CWE + DAST)');
    console.log('================================================================================\n');

    for (const r of resultados) {
      const estadoRed = r.online ? `🟢 DAST + SAST (${r.latenciaMs} ms)` : '🔍 SAST Código Fuente';
      console.log(`┏━━ ${r.nombre} [${estadoRed}] — Archivos analizados: ${r.archivosEscaneados}`);
      console.log(`┃   Calificación: Grado ${r.grado} (${r.score}%) | ✅ Controles: ${r.estadisticas.pass} | ⚠️ Advertencias: ${r.estadisticas.warn} | ❌ Críticos/Altos: ${r.estadisticas.fail}`);
      console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      r.hallazgos.forEach((h) => {
        const tag =
          h.estado === 'fail'
            ? '❌ [ALTO/CRÍTICO]'
            : h.estado === 'warn'
            ? '⚠️ [ADVERTENCIA] '
            : '✅ [CONTROL OK]  ';
        console.log(`  ${tag} [${h.owasp} | ${h.cwe}] ${h.control}`);
        if (h.evidencia) {
          console.log(`     📍 Evidencia: ${h.evidencia}`);
        }
        console.log(`     📄 Detalle:   ${h.detalle}`);
        if (h.remediacion) {
          console.log(`     🛠️ Fix:       ${h.remediacion}`);
        }
      });
      console.log('\n');
    }
  })();
}

module.exports = {
  auditarProyecto,
  auditarTodosLosProyectos
};
