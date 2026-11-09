'use strict';

/**
 * Servicio de lanzamiento desacoplado de procesos (.bat / CLI) y control de encendido/apagado de sistemas.
 */

const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolverRutaProyectoSegura } = require('../../utils/archivos');
const { obtenerPuertosOcupadosCatalogo } = require('../../utils/urls');
const { validarComandoInicio } = require('../catalogo/validacion');
const { buscarProyectoPorId, nombreProyecto } = require('../catalogo/repositorio');
const {
  duenosPuerto,
  verificarPuerto,
  esperarEstadoPuerto,
  reasignarPuertoLibreAProyecto
} = require('./puertos');
const { detectarBatsEnCarpetaProyecto, resolverBatSeguro } = require('./scripts-bat');

function lanzarProcesoDesacoplado(argsCmd, cwd, env = process.env) {
  const child = spawn('cmd.exe', argsCmd, {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env
  });
  // Sin este manejador, un error al lanzar (por ejemplo, fuera de Windows) tumbaría el servidor.
  child.on('error', (err) => console.error(`[panel] No se pudo ejecutar el proceso: ${err.message}`));
  child.unref();
}

/**
 * Inicia (o reinicia) un proyecto. Devuelve { codigo, data } para responder por HTTP.
 * Lo usan /api/start-project y /api/login-as.
 */
async function iniciarProyecto(body) {
  const esperar = body.esperar !== false;
  const reiniciar = Boolean(body.forzar);

  const { proyectos, proyecto } = buscarProyectoPorId(body.id);
  if (!proyecto) return { codigo: 404, data: { ok: false, error: 'Proyecto no encontrado.' } };

  const validacion = resolverRutaProyectoSegura(proyecto.carpetaLocal);
  if (!validacion.ok) return { codigo: validacion.codigo, data: { ok: false, error: validacion.error } };
  const { rutaAbsoluta } = validacion;

  let puerto = Number(proyecto.puerto);
  let yaActivo = await verificarPuerto(puerto);
  const dueno = duenosPuerto.get(puerto);

  // Otro sistema (iniciado por el panel) ya ocupa este puerto.
  if (yaActivo && dueno && dueno !== proyecto.id && !body.autoPuertoLibre) {
    return {
      codigo: 409,
      data: {
        ok: false,
        conflicto: true,
        ocupadoPor: dueno,
        error: `El puerto ${puerto} está ocupado por ${nombreProyecto(proyectos, dueno)}. Detenlo o mueve este sistema a un puerto libre.`
      }
    };
  }

  if (yaActivo && body.autoPuertoLibre) {
    puerto = await reasignarPuertoLibreAProyecto(proyecto, proyectos);
    yaActivo = false;
  }

  if (yaActivo && reiniciar) {
    const rutaDetener = resolverBatSeguro(rutaAbsoluta, proyecto.archivoBatDetener);
    if (!rutaDetener) {
      return {
        codigo: 409,
        data: {
          ok: false,
          error: 'Este sistema no tiene un script .bat de detención. Ciérralo manualmente y vuelve a activarlo.'
        }
      };
    }
    lanzarProcesoDesacoplado(['/c', 'start', '""', path.basename(rutaDetener)], path.dirname(rutaDetener));
    const seApago = await esperarEstadoPuerto(puerto, false, 22);
    if (!seApago) {
      return {
        codigo: 504,
        data: {
          ok: false,
          error: `Se ejecutó ${proyecto.archivoBatDetener}, pero el puerto ${puerto} sigue activo.`
        }
      };
    }
    duenosPuerto.delete(puerto);
    yaActivo = false;
  }

  if (yaActivo) {
    return {
      codigo: 200,
      data: {
        ok: true,
        yaEstabaActivo: true,
        online: true,
        sinConfirmar: !dueno && obtenerPuertosOcupadosCatalogo(proyectos, proyecto.id).has(puerto),
        puerto,
        urlBase: proyecto.urlBase,
        mensaje: `El puerto ${puerto} ya está en uso.`
      }
    };
  }

  const envConPuerto = {
    ...process.env,
    PORT: String(puerto),
    SERVER_PORT: String(puerto),
    FLASK_RUN_PORT: String(puerto),
    VITE_PORT: String(puerto)
  };

  const infoBat = detectarBatsEnCarpetaProyecto(proyecto.carpetaLocal);
  const rutaBat = resolverBatSeguro(rutaAbsoluta, proyecto.archivoBat || infoBat.batInicio);
  let metodoEjecutado = '';

  if (rutaBat) {
    lanzarProcesoDesacoplado(['/c', 'start', '""', path.basename(rutaBat)], path.dirname(rutaBat), envConPuerto);
    metodoEjecutado = path.relative(rutaAbsoluta, rutaBat);
  } else if (proyecto.comandoInicio && !proyecto.comandoInicio.toLowerCase().endsWith('.bat')) {
    const comando = validarComandoInicio(proyecto.comandoInicio);
    if (!comando.ok) return { codigo: 400, data: { ok: false, error: comando.error } };
    lanzarProcesoDesacoplado(['/c', 'start', '""', 'cmd.exe', '/k', comando.valor], rutaAbsoluta, envConPuerto);
    metodoEjecutado = comando.valor;
  } else {
    return {
      codigo: 400,
      data: {
        ok: false,
        error: 'No se encontró archivo .bat ni comando de inicio para este proyecto.'
      }
    };
  }

  duenosPuerto.set(puerto, proyecto.id);

  let online = false;
  if (esperar && puerto) {
    online = await esperarEstadoPuerto(puerto, true, 16);
  }

  return {
    codigo: 200,
    data: {
      ok: true,
      iniciado: true,
      reiniciado: reiniciar,
      online,
      puerto,
      urlBase: proyecto.urlBase,
      ejecutado: metodoEjecutado,
      mensaje: online
        ? `Servidor iniciado con ${metodoEjecutado} y escuchando en el puerto ${puerto}.`
        : `Se ejecutó ${metodoEjecutado}. El servidor sigue arrancando en su ventana (puerto ${puerto}).`
    }
  };
}

/**
 * Detiene un proyecto ejecutando su script .bat de detención.
 */
async function detenerProyecto(id) {
  const { proyecto } = buscarProyectoPorId(id);
  if (!proyecto) return { codigo: 404, data: { ok: false, error: 'Proyecto no encontrado.' } };

  const validacion = resolverRutaProyectoSegura(proyecto.carpetaLocal);
  if (!validacion.ok) return { codigo: validacion.codigo, data: { ok: false, error: validacion.error } };

  const infoBat = detectarBatsEnCarpetaProyecto(proyecto.carpetaLocal);
  const rutaDetener = resolverBatSeguro(validacion.rutaAbsoluta, proyecto.archivoBatDetener || infoBat.batDetener);
  if (!rutaDetener) {
    return { codigo: 400, data: { ok: false, error: 'Este proyecto no cuenta con un script .bat de detención.' } };
  }

  lanzarProcesoDesacoplado(['/c', 'start', '""', path.basename(rutaDetener)], path.dirname(rutaDetener));
  const seApago = await esperarEstadoPuerto(proyecto.puerto, false, 10);
  if (seApago) duenosPuerto.delete(Number(proyecto.puerto));
  return {
    codigo: 200,
    data: {
      ok: true,
      ejecutado: path.relative(validacion.rutaAbsoluta, rutaDetener),
      online: !seApago
    }
  };
}

module.exports = {
  lanzarProcesoDesacoplado,
  iniciarProyecto,
  detenerProyecto
};
