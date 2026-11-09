'use strict';

/**
 * Utilidades compartidas entre el servidor principal y los scripts de análisis
 * (detector de ficha técnica, auditoría de seguridad OWASP y pruebas de carga).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(ROOT_DIR, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
// PANEL_DATA_DIR permite apuntar a otra carpeta de datos (lo usan las pruebas para no tocar el catálogo real).
const DATA_DIR_PERSONALIZADO = Boolean(process.env.PANEL_DATA_DIR);
const DATA_DIR = DATA_DIR_PERSONALIZADO ? path.resolve(process.env.PANEL_DATA_DIR) : path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'proyectos.json');
// Catálogo de ejemplo que se copia la primera vez (el catálogo real no se sube a GitHub).
const EJEMPLO_FILE = path.join(ROOT_DIR, 'data', 'proyectos.ejemplo.json');
const BACKUP_DIR = path.join(DATA_DIR, 'respaldos');
const MAX_RESPALDOS = 25;
const DEFAULT_DATA_JS_FILE = path.join(PUBLIC_DIR, 'js', 'default-data.js');

const LIMITES = {
  maxProyectos: 200,
  maxRolesPorProyecto: 50,
  maxTextoCorto: 200,
  maxTextoLargo: 2000
};

const IGNORED_DIRS = new Set([
  'node_modules',
  'vendor',
  '.git',
  '.venv',
  'venv',
  'dist',
  'build',
  'storage',
  '__pycache__',
  'backend-dist',
  '_to_delete'
]);

/**
 * Verifica de forma segura que `rutaHija` esté dentro de `directorioBase`
 * previniendo vulnerabilidades de Path Traversal por coincidencia parcial de prefijo.
 */
function estaDentroDeDirectorio(rutaHija, directorioBase) {
  const rel = path.relative(directorioBase, rutaHija);
  return Boolean(rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)));
}

/**
 * Asegura que el directorio de datos exista.
 */
function asegurarDirectorioDatos() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Lee y parsea un archivo JSON de forma segura.
 */
function leerJSONSeguro(ruta, valorPorDefecto = null) {
  try {
    if (fs.existsSync(ruta)) {
      return JSON.parse(fs.readFileSync(ruta, 'utf8'));
    }
  } catch {
    // Ignorar errores de lectura o parseo
  }
  return valorPorDefecto;
}

/**
 * Lee el catálogo de proyectos desde data/proyectos.json.
 */
function leerProyectos() {
  asegurarDirectorioDatos();
  if (!fs.existsSync(DATA_FILE) && fs.existsSync(EJEMPLO_FILE)) {
    fs.copyFileSync(EJEMPLO_FILE, DATA_FILE);
  }
  const datos = leerJSONSeguro(DATA_FILE, []);
  return Array.isArray(datos) ? datos : [];
}

// --- RESPALDOS AUTOMÁTICOS ---------------------------------------------------

function marcaDeTiempoArchivo(fecha = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return (
    `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-` +
    `${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}-${p(fecha.getMilliseconds(), 3)}`
  );
}

const PATRON_NOMBRE_RESPALDO = /^proyectos-\d{8}-\d{6}-\d{3}\.json$/;

/**
 * Copia el catálogo actual a data/respaldos/ antes de sobrescribirlo y conserva solo los más recientes.
 */
function crearRespaldoCatalogo() {
  if (!fs.existsSync(DATA_FILE)) return null;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const nombre = `proyectos-${marcaDeTiempoArchivo()}.json`;
  fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, nombre));

  const sobrantes = listarRespaldos().slice(MAX_RESPALDOS);
  for (const r of sobrantes) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, r.nombre));
    } catch {
      // Ignorar si no se puede borrar un respaldo viejo
    }
  }
  return nombre;
}

/**
 * Lista los respaldos disponibles, del más reciente al más antiguo.
 */
function listarRespaldos() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => PATRON_NOMBRE_RESPALDO.test(n))
    .sort()
    .reverse()
    .map((nombre) => {
      const ruta = path.join(BACKUP_DIR, nombre);
      const datos = leerJSONSeguro(ruta, []);
      let fecha = null;
      try {
        fecha = fs.statSync(ruta).mtime.toISOString();
      } catch {
        // sin fecha
      }
      return {
        nombre,
        fecha,
        totalSistemas: Array.isArray(datos) ? datos.length : 0
      };
    });
}

/**
 * Restaura un respaldo por nombre (validado contra el patrón para evitar rutas arbitrarias).
 */
function restaurarRespaldo(nombre) {
  const limpio = String(nombre || '').trim();
  if (!PATRON_NOMBRE_RESPALDO.test(limpio)) {
    return { ok: false, codigo: 400, error: 'Nombre de respaldo inválido.' };
  }
  const ruta = path.join(BACKUP_DIR, limpio);
  if (!fs.existsSync(ruta)) {
    return { ok: false, codigo: 404, error: 'El respaldo no existe.' };
  }
  const datos = leerJSONSeguro(ruta, null);
  const validacion = validarCatalogo(datos);
  if (!validacion.ok) {
    return { ok: false, codigo: 422, error: `El respaldo no es válido: ${validacion.errores[0]}` };
  }
  guardarProyectos(validacion.proyectos);
  return { ok: true, proyectos: validacion.proyectos };
}

/**
 * Guarda el catálogo en data/proyectos.json (respaldando la versión anterior) y sincroniza
 * public/js/default-data.js para el modo sin servidor.
 */
function guardarProyectos(proyectos) {
  asegurarDirectorioDatos();
  const jsonPretty = JSON.stringify(proyectos, null, 2);

  // No crear respaldo si el contenido no cambió.
  let actual = null;
  try {
    actual = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf8') : null;
  } catch {
    actual = null;
  }
  if (actual === jsonPretty) return false;
  if (actual !== null) crearRespaldoCatalogo();

  // Escritura atómica: primero a un temporal y luego se renombra.
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, jsonPretty, 'utf8');
  fs.renameSync(tmp, DATA_FILE);

  if (!DATA_DIR_PERSONALIZADO) {
    try {
      if (fs.existsSync(path.dirname(DEFAULT_DATA_JS_FILE))) {
        const contenidoJs = `// Datos preconfigurados sincronizados automáticamente con data/proyectos.json\nwindow.PROYECTOS_DEFAULT = ${jsonPretty};\n`;
        fs.writeFileSync(DEFAULT_DATA_JS_FILE, contenidoJs, 'utf8');
      }
    } catch {
      // Ignorar si no se puede escribir el archivo de respaldo estático
    }
  }
  return true;
}

// --- VALIDACIÓN -------------------------------------------------------------

const PATRON_ID = /^[A-Za-z0-9_-]{1,80}$/;
// Caracteres que permitirían encadenar o redirigir comandos en cmd.exe.
const METACARACTERES_SHELL = /[&|<>^%!"'`;()$\r\n]/;
const PATRON_BAT = /^[\w .\-\\/]+\.bat$/i;
const PATRON_COMANDO = /^(npm|pnpm|yarn|node|python|python3|py|php|composer|flask|uvicorn)(\s+[\w.\-:/\\=@]+)*$/i;

/**
 * Valida el comando de inicio de un proyecto.
 * Se permite: vacío, un archivo .bat relativo a la carpeta del proyecto, o un comando
 * de herramientas de desarrollo conocidas (npm run dev, python run.py, php artisan serve...).
 */
function validarComandoInicio(comando) {
  const c = String(comando ?? '').trim();
  if (!c) return { ok: true, valor: '' };
  if (c.length > LIMITES.maxTextoCorto) return { ok: false, error: 'El comando es demasiado largo.' };
  if (METACARACTERES_SHELL.test(c)) {
    return { ok: false, error: 'El comando contiene caracteres no permitidos (& | < > ^ % ! " \' ` ; ( ) $).' };
  }
  if (c.toLowerCase().endsWith('.bat')) {
    if (!PATRON_BAT.test(c) || c.split(/[\\/]/).includes('..') || path.isAbsolute(c)) {
      return { ok: false, error: 'El .bat debe ser una ruta relativa dentro de la carpeta del proyecto.' };
    }
    return { ok: true, valor: c };
  }
  if (!PATRON_COMANDO.test(c)) {
    return {
      ok: false,
      error: 'Usa un archivo .bat o un comando que empiece con npm, node, python, py, php, composer, yarn o pnpm.'
    };
  }
  return { ok: true, valor: c };
}

/**
 * Valida la ruta de acceso de un rol: debe ser relativa (/login) o una URL de localhost.
 */
function validarRutaAcceso(ruta) {
  const r = String(ruta ?? '').trim() || '/';
  if (r.length > LIMITES.maxTextoCorto) return false;
  if (/^https?:\/\//i.test(r)) return esUrlLocalSegura(r);
  return !/^[a-z][a-z0-9+.-]*:/i.test(r) && !r.startsWith('//');
}

function textoSeguro(valor, max = LIMITES.maxTextoCorto) {
  return String(valor ?? '').slice(0, max);
}

/**
 * Valida y normaliza un catálogo completo. Devuelve { ok, proyectos, errores }.
 */
function validarCatalogo(datos) {
  const errores = [];
  if (!Array.isArray(datos)) {
    return { ok: false, proyectos: [], errores: ['Se esperaba un arreglo de proyectos.'] };
  }
  if (datos.length > LIMITES.maxProyectos) {
    return { ok: false, proyectos: [], errores: [`Máximo ${LIMITES.maxProyectos} proyectos.`] };
  }

  const ids = new Set();
  const proyectos = datos.map((p, i) => {
    const etiqueta = `Proyecto #${i + 1}${p && p.nombre ? ` (${p.nombre})` : ''}`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      errores.push(`${etiqueta}: formato inválido.`);
      return null;
    }
    if (!PATRON_ID.test(String(p.id || ''))) errores.push(`${etiqueta}: id inválido (solo letras, números, - y _).`);
    else if (ids.has(p.id)) errores.push(`${etiqueta}: id duplicado "${p.id}".`);
    ids.add(p.id);

    if (!String(p.nombre || '').trim()) errores.push(`${etiqueta}: falta el nombre.`);

    const puerto = Number(p.puerto);
    if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
      errores.push(`${etiqueta}: puerto inválido.`);
    }
    if (p.urlBase && !esUrlLocalSegura(p.urlBase)) {
      errores.push(`${etiqueta}: la URL base debe apuntar a localhost o 127.0.0.1.`);
    }

    for (const campo of ['comandoInicio', 'archivoBat', 'archivoBatDetener']) {
      if (!p[campo]) continue;
      const v = validarComandoInicio(p[campo]);
      if (!v.ok) errores.push(`${etiqueta}: ${campo} — ${v.error}`);
      else if (campo !== 'comandoInicio' && !v.valor.toLowerCase().endsWith('.bat')) {
        errores.push(`${etiqueta}: ${campo} debe ser un archivo .bat.`);
      }
    }

    if (!Array.isArray(p.roles)) {
      errores.push(`${etiqueta}: roles debe ser un arreglo.`);
    } else {
      if (p.roles.length > LIMITES.maxRolesPorProyecto) errores.push(`${etiqueta}: demasiados roles.`);
      p.roles.forEach((r, j) => {
        if (!r || typeof r !== 'object') {
          errores.push(`${etiqueta}: rol #${j + 1} inválido.`);
          return;
        }
        if (!validarRutaAcceso(r.rutaAcceso)) {
          errores.push(`${etiqueta}: la ruta del rol "${r.rol || j + 1}" debe ser relativa (/login) o de localhost.`);
        }
      });
    }

    return {
      ...p,
      id: String(p.id || ''),
      nombre: textoSeguro(p.nombre).trim(),
      subtitulo: textoSeguro(p.subtitulo, LIMITES.maxTextoLargo),
      categoria: textoSeguro(p.categoria || 'General'),
      puerto,
      notasSistema: textoSeguro(p.notasSistema, LIMITES.maxTextoLargo),
      stack: Array.isArray(p.stack) ? p.stack.map((s) => textoSeguro(s)).slice(0, 40) : [],
      roles: Array.isArray(p.roles)
        ? p.roles.map((r) => ({
            ...r,
            id: textoSeguro(r && r.id),
            rol: textoSeguro(r && r.rol),
            usuario: textoSeguro(r && r.usuario),
            password: textoSeguro(r && r.password),
            pin: textoSeguro(r && r.pin),
            rutaAcceso: textoSeguro((r && r.rutaAcceso) || '/'),
            permisos: textoSeguro(r && r.permisos, LIMITES.maxTextoLargo)
          }))
        : []
    };
  });

  return { ok: errores.length === 0, proyectos: errores.length ? [] : proyectos, errores };
}

/**
 * Parsea argumentos de línea de comandos tanto posicionales como con banderas (--proyecto=..., --max=..., --json).
 */
function parsearArgumentosCLI(argv = process.argv.slice(2)) {
  let filtro = '';
  let max = null;
  let json = false;

  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
    } else if (arg.startsWith('--proyecto=')) {
      filtro = arg.split('=')[1] || '';
    } else if (arg.startsWith('--max=')) {
      max = Number(arg.split('=')[1]) || null;
    } else if (!arg.startsWith('--')) {
      if (!filtro) {
        filtro = arg;
      } else if (max === null && !Number.isNaN(Number(arg))) {
        max = Number(arg);
      }
    }
  }

  return { filtro, max, json };
}

/**
 * Filtra la lista de proyectos por ID o nombre (para uso en CLI).
 */
function filtrarProyectosPorTermino(proyectos, filtro = '') {
  const termino = String(filtro || '').trim().toLowerCase();
  if (!termino) return proyectos;
  return proyectos.filter(
    (p) =>
      String(p.id || '').toLowerCase().includes(termino) ||
      String(p.nombre || '').toLowerCase().includes(termino)
  );
}

/**
 * Resuelve la carpeta local de un proyecto y verifica que esté dentro de WORKSPACE_ROOT y exista.
 * Retorna { ok, rutaAbsoluta, codigo, error }.
 */
function resolverRutaProyectoSegura(carpetaLocal) {
  const limpia = String(carpetaLocal || '').trim();
  if (!limpia) {
    return { ok: false, rutaAbsoluta: '', codigo: 400, error: 'Ruta de carpeta no especificada.' };
  }

  const rutaAbsoluta = path.resolve(ROOT_DIR, limpia);
  if (!estaDentroDeDirectorio(rutaAbsoluta, WORKSPACE_ROOT)) {
    return {
      ok: false,
      rutaAbsoluta,
      codigo: 403,
      error: 'La carpeta está fuera del directorio de proyectos permitido.'
    };
  }

  if (!fs.existsSync(rutaAbsoluta)) {
    return {
      ok: false,
      rutaAbsoluta,
      codigo: 404,
      error: `No se encontró la carpeta del proyecto: ${rutaAbsoluta}`
    };
  }

  return { ok: true, rutaAbsoluta, codigo: 200, error: null };
}

/**
 * Verifica si un nombre de directorio debe omitirse durante el escaneo de código.
 */
function debeIgnorarDirectorio(nombreDir) {
  return (
    IGNORED_DIRS.has(nombreDir) ||
    nombreDir.startsWith('.') ||
    nombreDir.startsWith('_respaldo')
  );
}

/**
 * Recorre recursivamente un directorio de proyecto recolectando archivos de código fuente.
 * Unifica la lógica usada tanto por el detector de ficha técnica como por el auditor SAST.
 */
function buscarArchivosCodigo(dirAbsoluto, opciones = {}) {
  const {
    maxDepth = 4,
    maxFiles = 250,
    maxSizeBytes = 500 * 1024,
    filtroArchivo = null
  } = opciones;

  const acumulados = [];

  function recorrer(actualDir, depth) {
    if (depth > maxDepth || acumulados.length >= maxFiles) return;

    let entries = [];
    try {
      entries = fs.readdirSync(actualDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (acumulados.length >= maxFiles) break;
      if (debeIgnorarDirectorio(entry.name)) continue;

      const fullPath = path.join(actualDir, entry.name);
      if (entry.isDirectory()) {
        recorrer(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.min.js')) continue;
        if (filtroArchivo && !filtroArchivo(entry.name, fullPath)) continue;

        try {
          const stats = fs.statSync(fullPath);
          if (stats.size <= maxSizeBytes) {
            acumulados.push({
              fullPath,
              relPath: path.relative(dirAbsoluto, fullPath).replace(/\\/g, '/'),
              ext: path.extname(entry.name).toLowerCase(),
              size: stats.size
            });
          }
        } catch {
          // Ignorar archivos inaccesibles
        }
      }
    }
  }

  recorrer(dirAbsoluto, 0);
  return acumulados;
}

/**
 * Verifica que una URL apunte exclusivamente a localhost / 127.0.0.1 / ::1.
 */
function esUrlLocalSegura(urlString) {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Construye una URL completa combinando la URL base del proyecto y la ruta del rol.
 */
function construirUrlRol(urlBase, rutaAcceso) {
  const base = String(urlBase || 'http://localhost:3000').replace(/\/+$/, '');
  const ruta = String(rutaAcceso || '/').trim();
  if (!ruta || ruta === '/') return base + '/';
  if (ruta.startsWith('http://') || ruta.startsWith('https://')) return ruta;
  return base + (ruta.startsWith('/') ? ruta : '/' + ruta);
}

/**
 * Obtiene la lista de URLs únicas de acceso de los roles de un proyecto.
 */
function obtenerUrlsRutasProyecto(proyecto) {
  const rutasUnicas = [...new Set((proyecto.roles || []).map((r) => r.rutaAcceso || '/'))];
  // Solo se devuelven URLs locales: una ruta absoluta hacia otro sitio nunca debe recibir tráfico.
  const urls = rutasUnicas
    .map((ruta) => construirUrlRol(proyecto.urlBase, ruta))
    .filter((url) => esUrlLocalSegura(url));
  if (urls.length === 0) {
    return [construirUrlRol(proyecto.urlBase, '/')];
  }
  return urls;
}

/**
 * Actualiza el puerto de una URL base manteniendo protocolo y host.
 */
function actualizarUrlConPuerto(urlBase, nuevoPuerto) {
  try {
    const u = new URL(urlBase || 'http://localhost:3000');
    u.port = String(nuevoPuerto);
    return u.origin;
  } catch {
    return `http://localhost:${nuevoPuerto}`;
  }
}

/**
 * Obtiene el conjunto de puertos asignados a otros proyectos en el catálogo.
 */
function obtenerPuertosOcupadosCatalogo(proyectos, excludeProjectId = '') {
  return new Set(
    proyectos
      .filter((p) => p.id !== excludeProjectId)
      .map((p) => Number(p.puerto))
      .filter((n) => Number.isInteger(n) && n > 0)
  );
}

module.exports = {
  ROOT_DIR,
  WORKSPACE_ROOT,
  PUBLIC_DIR,
  DATA_DIR,
  DATA_FILE,
  EJEMPLO_FILE,
  BACKUP_DIR,
  IGNORED_DIRS,
  estaDentroDeDirectorio,
  leerJSONSeguro,
  leerProyectos,
  guardarProyectos,
  crearRespaldoCatalogo,
  listarRespaldos,
  restaurarRespaldo,
  validarCatalogo,
  validarComandoInicio,
  validarRutaAcceso,
  parsearArgumentosCLI,
  filtrarProyectosPorTermino,
  resolverRutaProyectoSegura,
  debeIgnorarDirectorio,
  buscarArchivosCodigo,
  esUrlLocalSegura,
  construirUrlRol,
  obtenerUrlsRutasProyecto,
  actualizarUrlConPuerto,
  obtenerPuertosOcupadosCatalogo
};
