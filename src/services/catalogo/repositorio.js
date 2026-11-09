'use strict';

/**
 * Repositorio de persistencia del catálogo de proyectos (lectura, escritura atómica y búsqueda).
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  DATA_DIR,
  DATA_FILE,
  EJEMPLO_FILE,
  DEFAULT_DATA_JS_FILE,
  DATA_DIR_PERSONALIZADO
} = require('../../config/rutas-sistema');
const { leerJSONSeguro } = require('../../utils/archivos');
const {
  crearRespaldoCatalogo,
  listarRespaldos,
  restaurarRespaldo: restaurarRespaldoBase
} = require('./respaldos');

/**
 * Asegura que el directorio de datos exista.
 */
function asegurarDirectorioDatos() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
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

/**
 * Restaura un respaldo por nombre y lo persiste en el catálogo activo.
 */
function restaurarRespaldo(nombre) {
  return restaurarRespaldoBase(nombre, guardarProyectos);
}

function buscarProyectoPorId(id) {
  const limpio = String(id || '').trim();
  const proyectos = leerProyectos();
  const proyecto = proyectos.find((p) => p.id === limpio) || null;
  return { proyectos, proyecto, id: limpio };
}

function nombreProyecto(proyectos, id) {
  const p = proyectos.find((x) => x.id === id);
  return p ? p.nombre : id;
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

module.exports = {
  asegurarDirectorioDatos,
  leerProyectos,
  guardarProyectos,
  crearRespaldoCatalogo,
  listarRespaldos,
  restaurarRespaldo,
  buscarProyectoPorId,
  nombreProyecto,
  filtrarProyectosPorTermino
};
