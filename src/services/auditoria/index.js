'use strict';

/**
 * Orquestador del Motor Profesional de Auditoría de Seguridad Defensiva (SAST + Configuración + DAST Pasivo)
 * Basado en el estándar OWASP Top 10 (2021), OWASP ASVS v4.0 y catálogo CWE.
 */

const { resolverRutaProyectoSegura } = require('../../utils/archivos');
const { ejecutarAnalisisSAST } = require('./sast');
const {
  peticionPasivaHTTP,
  evaluarCabecerasSeguridadEnVivo,
  auditarRutasPorRolEnVivo
} = require('./dast');
const {
  evaluarHigieneCredenciales,
  evaluarArchivosConfiguracion,
  calcularPuntaje
} = require('./evaluadores');

async function auditarProyecto(proyecto) {
  const hallazgos = [];
  let archivosEscaneados = 0;

  // 1. Auditoría Dinámica Pasiva (si el servidor está encendido)
  const respRaiz = await peticionPasivaHTTP(proyecto.urlBase, 1800);
  const servidorOnline = Boolean(respRaiz.ok);

  if (servidorOnline) {
    hallazgos.push(...evaluarCabecerasSeguridadEnVivo(respRaiz.headers || {}));
    hallazgos.push(...(await auditarRutasPorRolEnVivo(proyecto)));
  }

  // 2. Auditoría Estática de Código Fuente (SAST) y Configuración en Disco
  const validacionCarpeta = resolverRutaProyectoSegura(proyecto.carpetaLocal);
  if (validacionCarpeta.ok) {
    const resultadoSAST = ejecutarAnalisisSAST(validacionCarpeta.rutaAbsoluta);
    archivosEscaneados = resultadoSAST.archivosEscaneados;
    hallazgos.push(...resultadoSAST.hallazgos);
    hallazgos.push(...evaluarArchivosConfiguracion(validacionCarpeta.rutaAbsoluta));
  }

  // 3. Auditoría de Políticas de Credenciales por Rol
  hallazgos.push(...evaluarHigieneCredenciales(proyecto.roles || []));

  const pesoEstado = { fail: 0, warn: 1, pass: 2, info: 3 };
  hallazgos.sort((a, b) => (pesoEstado[a.estado] ?? 4) - (pesoEstado[b.estado] ?? 4));

  const resumen = calcularPuntaje(hallazgos);

  return {
    id: proyecto.id,
    nombre: proyecto.nombre,
    urlBase: proyecto.urlBase,
    puerto: proyecto.puerto,
    carpetaLocal: proyecto.carpetaLocal,
    archivosEscaneados,
    online: servidorOnline,
    latenciaMs: respRaiz.latencyMs || null,
    score: resumen.score,
    grado: resumen.grado,
    fecha: new Date().toISOString(),
    estadisticas: {
      pass: hallazgos.filter((h) => h.estado === 'pass').length,
      warn: hallazgos.filter((h) => h.estado === 'warn').length,
      fail: hallazgos.filter((h) => h.estado === 'fail').length,
      info: hallazgos.filter((h) => h.estado === 'info').length
    },
    hallazgos
  };
}

async function auditarTodosLosProyectos(proyectos) {
  const reportes = [];
  for (const p of proyectos) {
    reportes.push(await auditarProyecto(p));
  }
  return reportes;
}

module.exports = {
  auditarProyecto,
  auditarTodosLosProyectos,
  ejecutarAnalisisSAST,
  peticionPasivaHTTP,
  evaluarCabecerasSeguridadEnVivo,
  auditarRutasPorRolEnVivo,
  evaluarHigieneCredenciales,
  evaluarArchivosConfiguracion,
  calcularPuntaje
};
