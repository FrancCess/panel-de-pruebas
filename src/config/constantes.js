'use strict';

/**
 * Constantes del servidor HTTP, cabeceras de seguridad, tipos MIME y scripts prioritarios.
 */

const DEFAULT_PORT = Number(process.env.PORT) || 4500;
const MAX_REINTENTOS_PUERTO = 10;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

// Solo se permiten recursos propios; las fuentes de Google son opcionales (sin internet se usan las del sistema).
const CSP_HTML = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'"
].join('; ');

const NOMBRES_BAT_PRIORITARIOS = [
  'iniciar-sistema.bat',
  'iniciar_sistema.bat',
  'iniciar.bat',
  'iniciar-app.bat',
  'start.bat',
  'run.bat'
];

module.exports = {
  DEFAULT_PORT,
  MAX_REINTENTOS_PUERTO,
  MAX_BODY_BYTES,
  MIME_TYPES,
  SECURITY_HEADERS,
  CSP_HTML,
  NOMBRES_BAT_PRIORITARIOS
};
