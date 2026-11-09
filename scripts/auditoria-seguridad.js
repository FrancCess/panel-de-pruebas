'use strict';

/**
 * Script CLI y exportador del Motor de Auditoría de Seguridad Defensiva (OWASP Top 10 / CWE).
 * Lógica principal modularizada en src/services/auditoria/
 */

const { leerProyectos, filtrarProyectosPorTermino } = require('../src/services/catalogo/repositorio');
const { parsearArgumentosCLI } = require('../src/utils/cli');
const { auditarProyecto, auditarTodosLosProyectos } = require('../src/services/auditoria');

if (require.main === module) {
  const proyectos = leerProyectos();
  const { filtro, json } = parsearArgumentosCLI();
  const seleccionados = filtrarProyectosPorTermino(proyectos, filtro);

  (async () => {
    const resultados = await auditarTodosLosProyectos(seleccionados);
    if (json) {
      console.log(JSON.stringify(resultados, null, 2));
      return;
    }

    console.log('================================================================================');
    console.log('  🛡️  AUDITORÍA PROFESIONAL DE SEGURIDAD (SAST + OWASP TOP 10 + CWE + DAST)');
    console.log('================================================================================\n');

    for (const r of resultados) {
      const estadoRed = r.online ? `🟢 DAST + SAST (${r.latenciaMs} ms)` : '🔍 SAST Código Fuente';
      console.log(`┏━━ ${r.nombre} [${estadoRed}] — Archivos analizados: ${r.archivosEscaneados}`);
      console.log(
        `┃   Calificación: Grado ${r.grado} (${r.score}%) | ✅ Controles: ${r.estadisticas.pass} | ⚠️ Advertencias: ${r.estadisticas.warn} | ❌ Críticos/Altos: ${r.estadisticas.fail}`
      );
      console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      r.hallazgos.forEach((h) => {
        const tag =
          h.estado === 'fail'
            ? '❌ [ALTO/CRÍTICO]'
            : h.estado === 'warn'
            ? '⚠️ [ADVERTENCIA] '
            : '✅ [CONTROL OK]  ';
        console.log(`  ${tag} [${h.owasp} | ${h.cwe}] ${h.control}`);
        if (h.evidencia) {
          console.log(`     📍 Evidencia: ${h.evidencia}`);
        }
        console.log(`     📄 Detalle:   ${h.detalle}`);
        if (h.remediacion) {
          console.log(`     🛠️ Fix:       ${h.remediacion}`);
        }
      });
      console.log('\n');
    }
  })();
}

module.exports = {
  auditarProyecto,
  auditarTodosLosProyectos
};
