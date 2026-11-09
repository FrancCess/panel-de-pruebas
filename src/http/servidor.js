'use strict';

/**
 * Instancia del servidor HTTP, enrutamiento principal y ciclo de arranque con reintentos de puerto.
 */

const http = require('node:http');
const { execFile } = require('node:child_process');
const { DATA_FILE } = require('../config/rutas-sistema');
const { MAX_REINTENTOS_PUERTO, SECURITY_HEADERS } = require('../config/constantes');
const { registrarPuertoPanel, obtenerPuertoPanel } = require('../services/procesos/puertos');
const { sincronizarBatsEnProyectos } = require('../services/procesos/scripts-bat');
const { validarPeticion } = require('./seguridad-http');
const { responderJSON } = require('./respuestas');
const { servirEstatico } = require('./estaticos');
const { rutas } = require('./rutas-api');

const server = http.createServer(async (req, res) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, 'http://localhost');
  } catch {
    return responderJSON(res, 400, { ok: false, error: 'URL inválida' });
  }
  const pathname = parsedUrl.pathname;
  const esApi = pathname.startsWith('/api/');

  const control = validarPeticion(req, esApi);
  if (!control.ok) {
    if (esApi) return responderJSON(res, control.codigo, { ok: false, error: control.error });
    res.writeHead(control.codigo, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(control.error);
  }

  if (esApi) {
    const manejador = rutas[`${req.method} ${pathname}`];
    if (!manejador) return responderJSON(res, 404, { ok: false, error: 'Ruta de API no encontrada.' });
    try {
      return await manejador(req, res, parsedUrl);
    } catch (err) {
      if (!res.headersSent) {
        return responderJSON(res, err.codigo || 500, { ok: false, error: err.message });
      }
      return undefined;
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, SECURITY_HEADERS);
    return res.end('Método no permitido');
  }
  return servirEstatico(pathname, res);
});

/**
 * Abre el navegador en la URL real del panel (en Windows). Así funciona aunque el panel
 * haya tenido que usar otro puerto porque el 4500 estaba ocupado.
 */
function abrirNavegador(url) {
  if (process.platform !== 'win32') return;
  execFile('explorer.exe', [url], () => {});
}

function iniciarServidor(puerto, { abrir = false, reintentos = MAX_REINTENTOS_PUERTO } = {}) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && reintentos > 0) {
      console.log(`Puerto ${puerto} en uso, intentando con ${puerto + 1}...`);
      iniciarServidor(puerto + 1, { abrir, reintentos: reintentos - 1 });
    } else {
      console.error('Error al iniciar el servidor:', err.message);
      process.exitCode = 1;
    }
  });

  server.listen(puerto, '127.0.0.1', () => {
    const puertoActivo = server.address().port;
    registrarPuertoPanel(puertoActivo);
    const url = `http://localhost:${obtenerPuertoPanel()}`;
    let detectados = 0;
    try {
      ({ detectados } = sincronizarBatsEnProyectos());
    } catch (err) {
      console.error('No se pudieron escanear los proyectos:', err.message);
    }
    console.log('==========================================================');
    console.log('  PANEL CENTRAL DE PRUEBAS WEB ACTIVO');
    console.log(`  URL: ${url}`);
    console.log(`  Scripts .bat de inicio detectados: ${detectados}`);
    console.log(`  Datos: ${DATA_FILE}`);
    console.log('  Cierra esta ventana para apagar el panel.');
    console.log('==========================================================');
    if (abrir) abrirNavegador(url);
  });
}

module.exports = {
  server,
  iniciarServidor,
  abrirNavegador
};
