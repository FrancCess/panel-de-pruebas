'use strict';

/**
 * Servicio de detección, resolución segura y sincronización de scripts .bat en carpetas de proyectos.
 */

const fs = require('node:fs');
const path = require('node:path');
const { NOMBRES_BAT_PRIORITARIOS } = require('../../config/constantes');
const {
  estaDentroDeDirectorio,
  resolverRutaProyectoSegura,
  debeIgnorarDirectorio
} = require('../../utils/archivos');
const { validarComandoInicio } = require('../catalogo/validacion');
const { leerProyectos, guardarProyectos } = require('../catalogo/repositorio');
const { enriquecerProyectosConFichaTecnica } = require('../deteccion/ficha-tecnica');

const mismaRuta = (a, b) =>
  String(a || '').toLowerCase().replace(/\//g, '\\') === String(b || '').toLowerCase().replace(/\//g, '\\');

/**
 * Busca archivos .bat dentro de la carpeta local de un proyecto (y un nivel de subcarpetas)
 * y clasifica el script principal de inicio y el de detención.
 */
function detectarBatsEnCarpetaProyecto(carpetaLocal) {
  const vacio = { batInicio: '', batDetener: '', batsDisponibles: [] };
  const validacion = resolverRutaProyectoSegura(carpetaLocal);
  if (!validacion.ok) return vacio;
  const { rutaAbsoluta } = validacion;

  const encontrados = [];
  try {
    const entries = fs.readdirSync(rutaAbsoluta, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.bat')) {
        encontrados.push(e.name);
      } else if (e.isDirectory() && !debeIgnorarDirectorio(e.name)) {
        try {
          const subEntries = fs.readdirSync(path.join(rutaAbsoluta, e.name), { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isFile() && sub.name.toLowerCase().endsWith('.bat')) {
              encontrados.push(`${e.name}\\${sub.name}`);
            }
          }
        } catch {
          // Ignorar subcarpetas sin permiso
        }
      }
    }
  } catch {
    return vacio;
  }

  let batInicio = '';
  for (const prio of NOMBRES_BAT_PRIORITARIOS) {
    const match = encontrados.find((b) => path.basename(b).toLowerCase() === prio);
    if (match) {
      batInicio = match;
      break;
    }
  }

  if (!batInicio) {
    batInicio =
      encontrados.find((b) => {
        const base = path.basename(b).toLowerCase();
        return /^(iniciar|arrancar|start|run|servidor)/i.test(base) && !/instal|reparar|detener|crear|primer/i.test(base);
      }) || '';
  }

  const batDetener = encontrados.find((b) => /^(detener|apagar|stop)/i.test(path.basename(b))) || '';

  return { batInicio, batDetener, batsDisponibles: encontrados };
}

/**
 * Actualiza los .bat detectados y la ficha técnica de cada proyecto.
 * Respeta la elección del usuario: si eligió un .bat que todavía existe o un comando (npm run dev, etc.),
 * no se reemplaza por el detectado automáticamente.
 */
function sincronizarBatsEnProyectos() {
  const proyectos = leerProyectos();
  let detectados = 0;

  proyectos.forEach((p) => {
    // Si la carpeta no existe por ahora (movida, disco desconectado...), no se toca la configuración.
    if (!resolverRutaProyectoSegura(p.carpetaLocal).ok) return;
    const infoBat = detectarBatsEnCarpetaProyecto(p.carpetaLocal);
    p.batsDisponibles = infoBat.batsDisponibles;

    const batElegidoExiste = p.archivoBat && infoBat.batsDisponibles.some((b) => mismaRuta(b, p.archivoBat));
    const comandoNoBat = p.comandoInicio && !String(p.comandoInicio).toLowerCase().endsWith('.bat');

    if (batElegidoExiste) {
      detectados++;
    } else if (comandoNoBat && !p.archivoBat) {
      // El usuario configuró un comando (npm run dev, python run.py...). Se respeta.
    } else if (infoBat.batInicio) {
      p.archivoBat = infoBat.batInicio;
      p.comandoInicio = infoBat.batInicio;
      detectados++;
    } else {
      p.archivoBat = '';
    }

    const detenerExiste =
      p.archivoBatDetener && infoBat.batsDisponibles.some((b) => mismaRuta(b, p.archivoBatDetener));
    if (!detenerExiste) p.archivoBatDetener = infoBat.batDetener || '';
  });

  enriquecerProyectosConFichaTecnica(proyectos);
  guardarProyectos(proyectos);
  return { proyectos, detectados };
}

/**
 * Resuelve un .bat relativo a la carpeta del proyecto y verifica que esté dentro de ella.
 */
function resolverBatSeguro(rutaProyecto, nombreBat) {
  if (!nombreBat) return null;
  const validacion = validarComandoInicio(nombreBat);
  if (!validacion.ok || !validacion.valor.toLowerCase().endsWith('.bat')) return null;
  const ruta = path.resolve(rutaProyecto, validacion.valor);
  if (!estaDentroDeDirectorio(ruta, rutaProyecto) || !fs.existsSync(ruta)) return null;
  return ruta;
}

module.exports = {
  detectarBatsEnCarpetaProyecto,
  sincronizarBatsEnProyectos,
  resolverBatSeguro
};
