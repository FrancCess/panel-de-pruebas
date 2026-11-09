'use strict';

/**
 * Utilidades de sistema de archivos, resolución segura contra Path Traversal y escáner recursivo de código.
 */

const fs = require('node:fs');
const path = require('node:path');
const { ROOT_DIR, WORKSPACE_ROOT, IGNORED_DIRS } = require('../config/rutas-sistema');

/**
 * Verifica de forma segura que `rutaHija` esté dentro de `directorioBase`
 * previniendo vulnerabilidades de Path Traversal por coincidencia parcial de prefijo.
 */
function estaDentroDeDirectorio(rutaHija, directorioBase) {
  const rel = path.relative(directorioBase, rutaHija);
  return Boolean(rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)));
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

module.exports = {
  estaDentroDeDirectorio,
  leerJSONSeguro,
  resolverRutaProyectoSegura,
  debeIgnorarDirectorio,
  buscarArchivosCodigo
};
