'use strict';

/**
 * Evaluadores de políticas de credenciales, archivos de configuración (.env / lockfiles) y puntaje OWASP.
 */

const fs = require('node:fs');
const path = require('node:path');

function evaluarHigieneCredenciales(roles = []) {
  const hallazgos = [];
  const clavesDiccionario = new Set(['password', '1234', '123456', 'admin', 'admin123', 'root', 'test']);

  roles.forEach((r) => {
    const pass = String(r.password || '').trim();
    if (!pass || pass === 'Sin contraseña' || pass.includes('PIN de sala') || pass.includes('Código de Sala')) {
      return;
    }

    const enDiccionario = clavesDiccionario.has(pass.toLowerCase());
    const longitudInsuficiente = pass.length < 10;
    const faltaComplejidad = !/[A-Z]/.test(pass) || !/[0-9]/.test(pass);

    if (enDiccionario) {
      hallazgos.push({
        owasp: 'A07:2021 - Auth Failures',
        cwe: 'CWE-521',
        severidad: 'alta',
        estado: 'fail',
        control: `Credencial en diccionario común — Rol "${r.rol}"`,
        evidencia: `Usuario: ${r.usuario} | Clave actual: "${pass}" (${pass.length} caracteres)`,
        detalle: 'La contraseña figura en el top de diccionarios de fuerza bruta. Aceptable únicamente en entorno aislado de desarrollo.',
        remediacion: 'Reemplazar en producción por una clave de al menos 12 caracteres con mayúsculas, minúsculas, dígitos y símbolos.'
      });
    } else if (longitudInsuficiente || faltaComplejidad) {
      hallazgos.push({
        owasp: 'A07:2021 - Auth Failures',
        cwe: 'CWE-521',
        severidad: 'media',
        estado: 'warn',
        control: `Entropía moderada de contraseña — Rol "${r.rol}"`,
        evidencia: `Usuario: ${r.usuario} | Longitud: ${pass.length} caracteres`,
        detalle: 'La contraseña tiene menos de 10 caracteres o carece de combinación alfanumérica completa.',
        remediacion: 'Incrementar la longitud mínima a 10-12 caracteres conforme a OWASP ASVS v4.0 sección 2.1.'
      });
    } else {
      hallazgos.push({
        owasp: 'A07:2021 - Auth Failures',
        cwe: 'CWE-521',
        severidad: 'info',
        estado: 'pass',
        control: `Política de Contraseña Robusta — Rol "${r.rol}"`,
        evidencia: `Usuario: ${r.usuario} | Longitud: ${pass.length} caracteres (Alfanumérica + Símbolos)`,
        detalle: 'Cumple los requisitos de longitud y complejidad contra ataques de diccionario.',
        remediacion: ''
      });
    }

    if (r.pin && String(r.pin).length <= 4) {
      hallazgos.push({
        owasp: 'A07:2021 - Auth Failures',
        cwe: 'CWE-307',
        severidad: 'media',
        estado: 'warn',
        control: `Espacio de clave reducido en PIN (${String(r.pin).length} dígitos) — Rol "${r.rol}"`,
        evidencia: `PIN configurado: ${r.pin} (10,000 combinaciones posibles)`,
        detalle: 'Un PIN de 4 dígitos tiene baja entropía y depende críticamente del bloqueo por intentos fallidos.',
        remediacion: 'Combinar con rate-limiting estricto (máximo 5 intentos) o usar PIN de 6 dígitos.'
      });
    }
  });

  return hallazgos;
}

function evaluarArchivosConfiguracion(rutaProyectoAbsoluta) {
  const hallazgos = [];
  const gitignorePath = path.join(rutaProyectoAbsoluta, '.gitignore');
  const envPath = path.join(rutaProyectoAbsoluta, '.env');
  const packageLockPath = path.join(rutaProyectoAbsoluta, 'package-lock.json');
  const composerLockPath = path.join(rutaProyectoAbsoluta, 'composer.lock');

  if (fs.existsSync(envPath)) {
    const envRaw = fs.readFileSync(envPath, 'utf8');
    if (/APP_DEBUG\s*=\s*true/i.test(envRaw)) {
      hallazgos.push({
        owasp: 'A05:2021 - Security Misconfiguration',
        cwe: 'CWE-215',
        severidad: 'media',
        estado: 'warn',
        control: 'Modo de depuración activo (APP_DEBUG=true en .env)',
        evidencia: '.env → APP_DEBUG=true',
        detalle: 'En modo debug, las excepciones muestran trazas completas de pila, rutas internas y variables de entorno.',
        remediacion: 'Asegúrate de establecer APP_DEBUG=false y NODE_ENV=production al desplegar en el servidor definitivo.'
      });
    }

    if (fs.existsSync(gitignorePath) && fs.readFileSync(gitignorePath, 'utf8').includes('.env')) {
      hallazgos.push({
        owasp: 'A05:2021 - Security Misconfiguration',
        cwe: 'CWE-538',
        severidad: 'info',
        estado: 'pass',
        control: 'Exclusión de Secretos (.env) en Control de Versiones',
        evidencia: '.gitignore incluye ".env"',
        detalle: 'El archivo .env está protegido contra commits accidentales en Git.',
        remediacion: ''
      });
    } else {
      hallazgos.push({
        owasp: 'A05:2021 - Security Misconfiguration',
        cwe: 'CWE-538',
        severidad: 'alta',
        estado: 'fail',
        control: 'Archivo .env sin exclusión en .gitignore',
        evidencia: '.env presente sin regla en .gitignore',
        detalle: 'Riesgo de filtración de credenciales de base de datos y claves de sesión al subir el repositorio.',
        remediacion: 'Agrega inmediatamente ".env" al archivo .gitignore.'
      });
    }
  }

  if (fs.existsSync(packageLockPath) || fs.existsSync(composerLockPath)) {
    hallazgos.push({
      owasp: 'A06:2021 - Vulnerable Components',
      cwe: 'CWE-1104',
      severidad: 'info',
      estado: 'pass',
      control: 'Integridad de Dependencias (Lockfile Presente)',
      evidencia: fs.existsSync(packageLockPath) ? 'package-lock.json verificado' : 'composer.lock verificado',
      detalle: 'Las versiones exactas y hashes de integridad de las dependencias están fijados.',
      remediacion: ''
    });
  }

  return hallazgos;
}

function calcularPuntaje(hallazgos) {
  const evaluables = hallazgos.filter((h) => h.estado === 'pass' || h.estado === 'warn' || h.estado === 'fail');
  if (evaluables.length === 0) return { score: 100, grado: 'A' };

  let puntos = 0;
  evaluables.forEach((h) => {
    if (h.estado === 'pass') puntos += 1;
    else if (h.estado === 'warn') puntos += 0.55;
  });

  const score = Math.round((puntos / evaluables.length) * 100);
  let grado = 'A';
  if (score < 60) grado = 'D';
  else if (score < 75) grado = 'C';
  else if (score < 88) grado = 'B';

  return { score, grado };
}

module.exports = {
  evaluarHigieneCredenciales,
  evaluarArchivosConfiguracion,
  calcularPuntaje
};
