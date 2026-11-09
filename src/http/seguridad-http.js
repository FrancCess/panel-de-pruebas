'use strict';

/**
 * Controles de seguridad HTTP contra DNS rebinding, CSRF y peticiones sin preflight.
 */

const { DEFAULT_PORT } = require('../config/constantes');
const { obtenerPuertoPanel } = require('../services/procesos/puertos');

function hostsPermitidos() {
  const puerto = obtenerPuertoPanel() || DEFAULT_PORT;
  return new Set([`localhost:${puerto}`, `127.0.0.1:${puerto}`, `[::1]:${puerto}`]);
}

function origenesPermitidos() {
  return new Set([...hostsPermitidos()].map((h) => `http://${h}`));
}

/**
 * Bloquea:
 *  - DNS rebinding: el header Host debe ser exactamente localhost/127.0.0.1 con el puerto del panel.
 *  - CSRF: una página de otro sitio no puede llamar a la API (Origin y Sec-Fetch-Site).
 *  - Peticiones "simples" sin preflight: los POST deben ser application/json.
 */
function validarPeticion(req, esApi) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!hostsPermitidos().has(host)) {
    return { ok: false, codigo: 421, error: 'Host no permitido. Abre el panel desde http://localhost.' };
  }

  if (!esApi) return { ok: true };

  const origin = req.headers.origin;
  if (origin && !origenesPermitidos().has(String(origin).toLowerCase())) {
    return { ok: false, codigo: 403, error: 'Origen no permitido.' };
  }

  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && !['same-origin', 'none'].includes(String(fetchSite))) {
    return { ok: false, codigo: 403, error: 'Petición entre sitios bloqueada.' };
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const tipo = String(req.headers['content-type'] || '').toLowerCase();
    if (!tipo.startsWith('application/json')) {
      return { ok: false, codigo: 415, error: 'Las peticiones deben enviarse como application/json.' };
    }
  }

  return { ok: true };
}

module.exports = {
  hostsPermitidos,
  origenesPermitidos,
  validarPeticion
};
