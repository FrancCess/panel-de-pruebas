'use strict';

/**
 * Motor DAST Pasivo (Dynamic Application Security Testing):
 * Inspecciona cabeceras de seguridad HTTP en vivo y control de acceso en rutas privadas sobre localhost.
 */

const http = require('node:http');
const https = require('node:https');
const { esUrlLocalSegura, construirUrlRol } = require('../../utils/urls');

function peticionPasivaHTTP(urlString, timeout = 2200) {
  return new Promise((resolve) => {
    if (!esUrlLocalSegura(urlString)) {
      return resolve({ ok: false, error: 'Solo se permite auditar hosts locales (localhost / 127.0.0.1).' });
    }

    const parsed = new URL(urlString);
    const client = parsed.protocol === 'https:' ? https : http;
    const inicio = Date.now();

    const req = client.request(
      parsed,
      {
        method: 'GET',
        timeout,
        headers: {
          'User-Agent': 'OWASP-DefensiveAuditor/2.0 (Local-Audit)',
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8'
        }
      },
      (res) => {
        let bodySample = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (bodySample.length < 4096) bodySample += chunk;
        });
        res.on('end', () => {
          resolve({
            ok: true,
            statusCode: res.statusCode,
            headers: res.headers,
            latencyMs: Date.now() - inicio,
            bodySample
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout' });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.end();
  });
}

function evaluarCabecerasSeguridadEnVivo(headers) {
  const hallazgos = [];

  if (headers['content-security-policy']) {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-693',
      severidad: 'info',
      estado: 'pass',
      control: 'DAST Pasivo: Content-Security-Policy (CSP)',
      evidencia: String(headers['content-security-policy']).slice(0, 100),
      detalle: 'Cabecera CSP activa en la respuesta HTTP en vivo.',
      remediacion: ''
    });
  } else {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-693',
      severidad: 'media',
      estado: 'warn',
      control: 'DAST Pasivo: Content-Security-Policy (CSP) ausente',
      evidencia: 'Cabecera no presente en la respuesta HTTP',
      detalle: 'El servidor en ejecución no devuelve una política CSP para restringir orígenes de scripts y estilos.',
      remediacion: "Configura Content-Security-Policy: default-src 'self' en tu servidor."
    });
  }

  if (String(headers['x-content-type-options'] || '').toLowerCase() === 'nosniff') {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-16',
      severidad: 'info',
      estado: 'pass',
      control: 'DAST Pasivo: X-Content-Type-Options',
      evidencia: 'X-Content-Type-Options: nosniff',
      detalle: 'Protección contra MIME-sniffing activa.',
      remediacion: ''
    });
  } else {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-16',
      severidad: 'media',
      estado: 'fail',
      control: 'DAST Pasivo: X-Content-Type-Options ausente',
      evidencia: 'Sin cabecera X-Content-Type-Options',
      detalle: 'El navegador podría interpretar archivos subidos con un tipo MIME distinto al declarado.',
      remediacion: 'Añade res.setHeader("X-Content-Type-Options", "nosniff").'
    });
  }

  if (headers['x-powered-by']) {
    hallazgos.push({
      owasp: 'A05:2021 - Security Misconfiguration',
      cwe: 'CWE-200',
      severidad: 'baja',
      estado: 'warn',
      control: 'DAST Pasivo: Fuga de huella del servidor (X-Powered-By)',
      evidencia: `X-Powered-By: ${headers['x-powered-by']}`,
      detalle: 'El servidor revela la tecnología subyacente en las cabeceras de respuesta.',
      remediacion: 'Usa app.disable("x-powered-by") en Express o expose_php = Off en php.ini.'
    });
  }

  return hallazgos;
}

async function auditarRutasPorRolEnVivo(proyecto) {
  const hallazgos = [];
  const rutasUnicas = [...new Set((proyecto.roles || []).map((r) => r.rutaAcceso || '/'))];

  for (const ruta of rutasUnicas) {
    const urlDestino = construirUrlRol(proyecto.urlBase, ruta);
    const resp = await peticionPasivaHTTP(urlDestino, 2000);
    if (!resp.ok) continue;

    const esRutaPrivada = /admin|tutor|alumno|superadmin|coord|dashboard/i.test(ruta) && !/login/i.test(ruta);
    const protegida =
      resp.statusCode === 301 ||
      resp.statusCode === 302 ||
      resp.statusCode === 303 ||
      resp.statusCode === 401 ||
      resp.statusCode === 403 ||
      /type=["']password["']|iniciar sesi|login/i.test(resp.bodySample || '');

    if (esRutaPrivada) {
      hallazgos.push({
        owasp: 'A01:2021 - Broken Access Control',
        cwe: 'CWE-285',
        severidad: protegida ? 'info' : 'alta',
        estado: protegida ? 'pass' : 'fail',
        control: `DAST Pasivo: Control de Acceso en Ruta Privada (${ruta})`,
        evidencia: `GET ${urlDestino} → HTTP ${resp.statusCode} (${resp.latencyMs} ms)`,
        detalle: protegida
          ? 'La ruta rechaza peticiones anónimas o redirige correctamente al formulario de login.'
          : 'La ruta privada respondió HTTP 200 sin sesión aparente. Verifica su middleware de autenticación.',
        remediacion: protegida ? '' : 'Aplica middleware de verificación de sesión y rol antes de servir esta vista.'
      });
    }
  }
  return hallazgos;
}

module.exports = {
  peticionPasivaHTTP,
  evaluarCabecerasSeguridadEnVivo,
  auditarRutasPorRolEnVivo
};
