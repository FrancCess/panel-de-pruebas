'use strict';

/**
 * Servidor de archivos estáticos desde el directorio public/ con cabeceras de seguridad y CSP.
 */

const fs = require('node:fs');
const path = require('node:path');
const { PUBLIC_DIR } = require('../config/rutas-sistema');
const { MIME_TYPES, SECURITY_HEADERS, CSP_HTML } = require('../config/constantes');
const { estaDentroDeDirectorio } = require('../utils/archivos');

function servirEstatico(pathname, res) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  try {
    safePath = decodeURIComponent(safePath);
  } catch {
    res.writeHead(400, SECURITY_HEADERS);
    return res.end('Ruta inválida');
  }
  safePath = path.normalize(safePath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!estaDentroDeDirectorio(filePath, PUBLIC_DIR)) {
    res.writeHead(403, SECURITY_HEADERS);
    return res.end('Acceso denegado');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Archivo no encontrado');
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    };
    if (ext === '.html') headers['Content-Security-Policy'] = CSP_HTML;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

module.exports = {
  servirEstatico
};
