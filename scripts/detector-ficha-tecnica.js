'use strict';

/**
 * Script CLI y exportador del Detector Automático de Tecnologías y Ficha Técnica.
 * Lógica principal en src/services/deteccion/ficha-tecnica.js
 */

const { leerProyectos, guardarProyectos } = require('../src/services/catalogo/repositorio');
const {
  analizarCarpetaProyecto,
  enriquecerProyectosConFichaTecnica
} = require('../src/services/deteccion/ficha-tecnica');

if (require.main === module) {
  const proyectos = leerProyectos();
  const { actualizados } = enriquecerProyectosConFichaTecnica(proyectos);
  guardarProyectos(proyectos);

  console.log('================================================================================');
  console.log(`  📋 FICHAS TÉCNICAS GENERADAS AUTOMÁTICAMENTE (${actualizados} sistemas)`);
  console.log('================================================================================\n');

  for (const p of proyectos) {
    const f = p.fichaTecnica;
    if (!f) continue;
    console.log(`┏━━ ${p.nombre} (v${f.version}) — ${f.tipoArquitectura}`);
    console.log(`┃   Runtime:       ${f.motorRuntime}`);
    console.log(`┃   Lenguajes:     ${f.lenguajes.join(', ') || '—'}`);
    console.log(`┃   Backend:       ${f.backend.join(', ') || '—'}`);
    console.log(`┃   Frontend:      ${f.frontend.join(', ') || '—'}`);
    console.log(`┃   Base de Datos: ${f.baseDatos.join(', ') || '—'}`);
    console.log(`┃   Módulos Clave: ${f.libreriasClave.join(', ') || '—'}`);
    console.log(`┃   Seguridad:     ${f.seguridad.join(', ') || '—'}`);
    console.log(`┃   Tablas BD (${f.tablasBaseDatos.length}): ${f.tablasBaseDatos.slice(0, 10).join(', ') || '—'}`);
    console.log(
      `┗━━ Métricas:      ${f.metricas.totalArchivosCodigo} archivos de código | ~${f.metricas.lineasDeCodigo.toLocaleString('es-MX')} líneas de código\n`
    );
  }
}

module.exports = {
  analizarCarpetaProyecto,
  enriquecerProyectosConFichaTecnica
};
