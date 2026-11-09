'use strict';

/**
 * Servicio de respaldos automáticos y restauración del catálogo de proyectos.
 */

const fs = require('node:fs');
const path = require('node:path');
const { DATA_FILE, BACKUP_DIR, MAX_RESPALDOS } = require('../../config/rutas-sistema');
const { leerJSONSeguro } = require('../../utils/archivos');
const { validarCatalogo } = require('./validacion');

const PATRON_NOMBRE_RESPALDO = /^proyectos-\d{8}-\d{6}-\d{3}\.json$/;

function marcaDeTiempoArchivo(fecha = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return (
    `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-` +
    `${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}-${p(fecha.getMilliseconds(), 3)}`
  );
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
 * Restaura un respaldo por nombre (validado contra el patrón para evitar rutas arbitrarias).
 */
function restaurarRespaldo(nombre, guardarFn) {
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
  if (typeof guardarFn === 'function') {
    guardarFn(validacion.proyectos);
  }
  return { ok: true, proyectos: validacion.proyectos };
}

module.exports = {
  crearRespaldoCatalogo,
  listarRespaldos,
  restaurarRespaldo
};
