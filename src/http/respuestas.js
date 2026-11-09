'use strict';

/**
 * Utilidades HTTP: lectura limitada de payloads JSON, serialización de respuestas y bloqueo de concurrencia.
 */

const { MAX_BODY_BYTES, SECURITY_HEADERS } = require('../config/constantes');

// Evita lanzar dos auditorías o dos pruebas de carga a la vez.
const operacionesEnCurso = new Set();

function leerBodyJSON(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamano = 0;
    let abortado = false;
    req.on('data', (chunk) => {
      if (abortado) return;
      tamano += chunk.length;
      if (tamano > MAX_BODY_BYTES) {
        abortado = true;
        reject(Object.assign(new Error('Payload demasiado grande'), { codigo: 413 }));
        req.resume();
        return;
      }
      partes.push(chunk);
    });
    req.on('end', () => {
      if (abortado) return;
      const body = Buffer.concat(partes).toString('utf8');
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { codigo: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function responderJSON(res, status, data) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

async function conBloqueo(clave, res, fn) {
  if (operacionesEnCurso.has(clave)) {
    return responderJSON(res, 409, {
      ok: false,
      error: 'Ya hay una operación de este tipo en curso. Espera a que termine.'
    });
  }
  operacionesEnCurso.add(clave);
  try {
    return await fn();
  } finally {
    operacionesEnCurso.delete(clave);
  }
}

module.exports = {
  operacionesEnCurso,
  leerBodyJSON,
  responderJSON,
  conBloqueo
};
