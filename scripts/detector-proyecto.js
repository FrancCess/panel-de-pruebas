'use strict';

/**
 * Detecta los datos básicos de un proyecto a partir de su carpeta
 * (nombre, descripción, comando de inicio y puerto) para llenar el formulario
 * de "Agregar sistema". Solo lee archivos; de los .env únicamente extrae el puerto.
 */

const fs = require('node:fs');
const path = require('node:path');
const { leerJSONSeguro, validarComandoInicio, estaDentroDeDirectorio } = require('./utils-proyectos');

const MAX_BYTES_LECTURA = 256 * 1024;

const PUERTO_POR_DEPENDENCIA = [
  ['@angular/core', 4200],
  ['astro', 4321],
  ['@sveltejs/kit', 5173],
  ['vite', 5173],
  ['next', 3000],
  ['nuxt', 3000],
  ['react-scripts', 3000]
];

const ARCHIVOS_ENV = ['.env.local', '.env.development', '.env'];
const ARCHIVOS_VITE = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts'];
const ARCHIVOS_SERVIDOR = [
  'server.js', 'app.js', 'index.js', 'main.js',
  'src/server.js', 'src/index.js', 'src/app.js', 'src/main.ts', 'src/server.ts', 'src/index.ts',
  'app.py', 'run.py', 'main.py', 'wsgi.py'
];
const ARCHIVOS_PYTHON = ['run.py', 'app.py', 'main.py'];

// Nombres de plantilla que no describen el proyecto: se usa el nombre de la carpeta.
const NOMBRES_GENERICOS = new Set([
  'laravel', 'app', 'myapp', 'viteproject', 'reactapp', 'vueproject', 'frontend', 'backend',
  'client', 'server', 'web', 'api', 'project', 'proyecto', 'nextapp'
]);

function leerTexto(ruta) {
  try {
    const stat = fs.statSync(ruta);
    if (!stat.isFile() || stat.size > MAX_BYTES_LECTURA) return '';
    return fs.readFileSync(ruta, 'utf8');
  } catch {
    return '';
  }
}

function puertoValido(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
}

/** Busca el primer puerto que coincida con alguno de los patrones (grupo 1). */
function puertoEnTexto(texto, patrones) {
  if (!texto) return null;
  for (const patron of patrones) {
    const m = texto.match(patron);
    const p = m && puertoValido(m[1]);
    if (p) return p;
  }
  return null;
}

const PATRONES_COMANDO = [
  /--port[= ](\d{2,5})\b/i,
  /(?:^|\s)-p\s+(\d{2,5})\b/,
  /\bPORT=(\d{2,5})\b/,
  /\brunserver\s+(?:[\d.]+:)?(\d{2,5})\b/,
  /\.py\s+(\d{4,5})\b/,
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\b/i
];

const PATRONES_ENV = [
  /^\s*(?:PORT|APP_PORT|SERVER_PORT|DEV_PORT|VITE_PORT|HTTP_PORT)\s*=\s*["']?(\d{2,5})["']?\s*$/m,
  /^\s*APP_URL\s*=\s*["']?https?:\/\/(?:localhost|127\.0\.0\.1)(?::(\d{2,5}))/m
];

const PATRONES_SERVIDOR = [
  /PORT\)?\s*(?:\|\||\?\?)\s*(\d{2,5})\b/,
  /\.listen\(\s*(\d{2,5})\b/,
  /\bport\s*=\s*(\d{4,5})\b/i,
  /\bport\s*:\s*(\d{4,5})\b/
];

function humanizarNombre(nombre) {
  return String(nombre || '')
    .replace(/^@[^/]+\//, '')
    .replace(/^[^/]+\//, '')
    .replace(/[-_.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)(\p{L})/gu, (_, esp, letra) => esp + letra.toUpperCase())
    .slice(0, 80);
}

function gestorDePaquetes(rutaAbsoluta) {
  if (fs.existsSync(path.join(rutaAbsoluta, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(rutaAbsoluta, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Elige el comando de inicio. Devuelve { comando, scriptNpm }.
 * Prioridad: .bat de inicio detectado, script npm (dev > start > serve), Laravel, Django, Python, PHP.
 */
function elegirComando(rutaAbsoluta, pkg, batInicio) {
  if (batInicio) return { comando: batInicio, scriptNpm: '' };

  const scripts = (pkg && pkg.scripts) || {};
  const gestor = gestorDePaquetes(rutaAbsoluta);
  // En apps de escritorio (Electron) "start" abre la ventana; el servidor web suele estar en otro script.
  const esElectron = Object.values(scripts).some((s) => /^\s*electron\b/.test(String(s)));
  const orden = esElectron ? ['backend', 'server', 'api', 'dev', 'start', 'serve'] : ['dev', 'start', 'serve'];
  for (const nombre of orden) {
    if (typeof scripts[nombre] === 'string' && !/^\s*electron\b/.test(scripts[nombre])) {
      const comando = gestor === 'npm' ? (nombre === 'start' ? 'npm start' : `npm run ${nombre}`) : `${gestor} ${nombre}`;
      return { comando, scriptNpm: scripts[nombre] };
    }
  }

  const existe = (archivo) => fs.existsSync(path.join(rutaAbsoluta, archivo));
  if (existe('artisan')) return { comando: 'php artisan serve', scriptNpm: '' };
  if (existe('manage.py')) return { comando: 'python manage.py runserver', scriptNpm: '' };
  const py = ARCHIVOS_PYTHON.find(existe);
  if (py) return { comando: `python ${py}`, scriptNpm: '' };
  if (existe('index.php')) return { comando: 'php -S localhost:8000', scriptNpm: '' };
  return { comando: '', scriptNpm: '' };
}

function detectarPuerto(rutaAbsoluta, pkg, { comando, scriptNpm }, batInicio) {
  // 1. Lo que realmente se ejecuta: el .bat o el script npm elegido.
  if (batInicio) {
    const p = puertoEnTexto(leerTexto(path.join(rutaAbsoluta, batInicio)), PATRONES_COMANDO);
    if (p) return p;
  }
  const pScript = puertoEnTexto(scriptNpm, PATRONES_COMANDO) || puertoEnTexto(comando, PATRONES_COMANDO);
  if (pScript) return pScript;

  // 2. Variables de entorno (solo se lee la línea del puerto).
  for (const archivo of ARCHIVOS_ENV) {
    const p = puertoEnTexto(leerTexto(path.join(rutaAbsoluta, archivo)), PATRONES_ENV);
    if (p) return p;
  }

  // 3. Configuración de Vite.
  for (const archivo of ARCHIVOS_VITE) {
    const p = puertoEnTexto(leerTexto(path.join(rutaAbsoluta, archivo)), [/\bport\s*:\s*(\d{2,5})\b/]);
    if (p) return p;
  }

  // 4. Archivo principal del servidor.
  const candidatos = [...new Set([pkg && typeof pkg.main === 'string' ? pkg.main : '', ...ARCHIVOS_SERVIDOR].filter(Boolean))];
  for (const archivo of candidatos) {
    const ruta = path.resolve(rutaAbsoluta, archivo);
    if (!estaDentroDeDirectorio(ruta, rutaAbsoluta)) continue;
    const p = puertoEnTexto(leerTexto(ruta), PATRONES_SERVIDOR);
    if (p) return p;
  }

  // 5. Puerto por defecto del framework.
  const deps = { ...((pkg && pkg.dependencies) || {}), ...((pkg && pkg.devDependencies) || {}) };
  for (const [dep, puerto] of PUERTO_POR_DEPENDENCIA) {
    if (deps[dep]) return puerto;
  }
  if (/^php artisan serve|^python manage\.py runserver/.test(comando)) return 8000;
  const requirements = leerTexto(path.join(rutaAbsoluta, 'requirements.txt'));
  if (/^\s*flask\b/im.test(requirements)) return 5000;
  if (/^\s*(fastapi|uvicorn)\b/im.test(requirements)) return 8000;
  return null;
}

/**
 * Analiza una carpeta (ruta absoluta ya validada) y devuelve los datos sugeridos.
 * `batInicio` es el .bat de inicio detectado (relativo a la carpeta), si lo hay.
 */
function detectarDatosDesdeCarpeta(rutaAbsoluta, { batInicio = '' } = {}) {
  const pkg = leerJSONSeguro(path.join(rutaAbsoluta, 'package.json'));
  const composer = leerJSONSeguro(path.join(rutaAbsoluta, 'composer.json'));

  const nombreBase = (pkg && pkg.name) || (composer && composer.name) || path.basename(rutaAbsoluta);
  const carpeta = path.basename(rutaAbsoluta);
  const comparable = (t) => String(t).replace(/^.*\//, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Si el paquete se llama igual que la carpeta, la carpeta suele tener mejores mayúsculas (aulaviva → AulaViva).
  const usarCarpeta = comparable(nombreBase) === comparable(carpeta) || NOMBRES_GENERICOS.has(comparable(nombreBase));
  const nombre = humanizarNombre(usarCarpeta ? carpeta : nombreBase) || carpeta;
  const descripcion = String((pkg && pkg.description) || (composer && composer.description) || '').trim().slice(0, 200);

  const eleccion = elegirComando(rutaAbsoluta, pkg, batInicio);
  const comandoValido = validarComandoInicio(eleccion.comando);
  const comandoInicio = comandoValido.ok ? comandoValido.valor : '';

  const puerto = detectarPuerto(rutaAbsoluta, pkg, eleccion, batInicio);

  return {
    nombre,
    subtitulo: descripcion,
    comandoInicio,
    puerto,
    urlBase: puerto ? `http://localhost:${puerto}` : ''
  };
}

module.exports = {
  detectarDatosDesdeCarpeta,
  humanizarNombre
};
