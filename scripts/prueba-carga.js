'use strict';

/**
 * Script CLI y exportador del Motor de Pruebas de Carga y Concurrencia.
 * Lógica principal en src/services/carga/prueba-carga.js
 */

const { leerProyectos, filtrarProyectosPorTermino } = require('../src/services/catalogo/repositorio');
const { parsearArgumentosCLI } = require('../src/utils/cli');
const { ejecutarPruebaCargaProyecto } = require('../src/services/carga/prueba-carga');

if (require.main === module) {
  const proyectos = leerProyectos();
  const { filtro, max, json } = parsearArgumentosCLI();
  const seleccionados = filtrarProyectosPorTermino(proyectos, filtro);
  const maxUsuariosArg = max || 200;

  (async () => {
    if (!json) {
      console.log('================================================================================');
      console.log('  📈 PRUEBA DE CARGA, CONCURRENCIA Y PUNTO DE QUIEBRE (LOCALHOST)');
      console.log('================================================================================\n');
    }

    const reportes = [];
    for (const p of seleccionados) {
      if (!json) console.log(`▶ Probando capacidad de: ${p.nombre} (${p.urlBase})...`);
      const rep = await ejecutarPruebaCargaProyecto(p, { maxUsuarios: maxUsuariosArg, modo: 'escalera' });
      reportes.push(rep);
      if (json) continue;

      if (!rep.ok) {
        console.log(`  ⚪ Omitido: ${rep.error}\n`);
        continue;
      }

      console.log(`  Rutas evaluadas: ${rep.rutasProbadas.join(', ')}`);
      console.log('  ----------------------------------------------------------------------------');
      console.log('  Usuarios | Peticiones | RPS    | Promedio | p95      | Errores | Estado');
      console.log('  ----------------------------------------------------------------------------');
      for (const e of rep.escalones) {
        const icono =
          e.estado === 'optimo' ? '🟢 Óptimo   ' : e.estado === 'degradado' ? '🟡 Degradado' : '🔴 Colapso  ';
        console.log(
          `  ${String(e.usuarios).padEnd(8)} | ${String(e.peticionesTotales).padEnd(10)} | ${String(e.rps + '/s').padEnd(6)} | ${String(e.promedioMs + ' ms').padEnd(8)} | ${String(e.p95Ms + ' ms').padEnd(8)} | ${String(e.tasaErrorPct + '%').padEnd(7)} | ${icono}`
        );
      }
      console.log('  ----------------------------------------------------------------------------');
      console.log(`  📊 Diagnóstico: ${rep.resumen.diagnostico}\n`);
    }
    if (json) {
      console.log(JSON.stringify(reportes, null, 2));
    }
  })();
}

module.exports = {
  ejecutarPruebaCargaProyecto
};
