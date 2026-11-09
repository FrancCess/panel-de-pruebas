'use strict';

/**
 * Controladores de las rutas REST de la API (/api/*).
 */

const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { resolverRutaProyectoSegura } = require('../utils/archivos');
const { actualizarUrlConPuerto, obtenerPuertosOcupadosCatalogo } = require('../utils/urls');
const { esperarMs } = require('../utils/cli');
const { validarCatalogo } = require('../services/catalogo/validacion');
const {
  leerProyectos,
  guardarProyectos,
  listarRespaldos,
  restaurarRespaldo,
  buscarProyectoPorId,
  nombreProyecto
} = require('../services/catalogo/repositorio');
const {
  duenosPuerto,
  obtenerPuertoPanel,
  verificarPuerto,
  esperarEstadoPuerto,
  encontrarPuertoLibre,
  reasignarPuertoLibreAProyecto,
  calcularEstadosProyectos,
  obtenerPuertosActivos
} = require('../services/procesos/puertos');
const {
  detectarBatsEnCarpetaProyecto,
  sincronizarBatsEnProyectos
} = require('../services/procesos/scripts-bat');
const { iniciarProyecto, detenerProyecto } = require('../services/procesos/lanzador');
const { analizarCarpetaProyecto } = require('../services/deteccion/ficha-tecnica');
const { detectarDatosDesdeCarpeta } = require('../services/deteccion/detector-proyecto');
const { auditarProyecto, auditarTodosLosProyectos } = require('../services/auditoria');
const { ejecutarPruebaCargaProyecto } = require('../services/carga/prueba-carga');
const {
  inicioAutomaticoDisponible,
  rolEsAutomatizable,
  iniciarSesionRol
} = require('../services/sesion/inicio-sesion');
const { leerBodyJSON, responderJSON, conBloqueo } = require('./respuestas');

const rutas = {
  'GET /api/proyectos': async (req, res) => {
    // Solo lectura: el escaneo de carpetas se hace al iniciar el panel o con /api/scan-bats.
    return responderJSON(res, 200, { ok: true, proyectos: leerProyectos() });
  },

  'POST /api/proyectos': async (req, res) => {
    const body = await leerBodyJSON(req);
    const validacion = validarCatalogo(body.proyectos);
    if (!validacion.ok) {
      return responderJSON(res, 422, { ok: false, error: validacion.errores[0], errores: validacion.errores });
    }
    guardarProyectos(validacion.proyectos);
    return responderJSON(res, 200, { ok: true, total: validacion.proyectos.length });
  },

  'GET /api/backups': async (req, res) => {
    return responderJSON(res, 200, { ok: true, respaldos: listarRespaldos() });
  },

  'POST /api/backups/restore': async (req, res) => {
    const body = await leerBodyJSON(req);
    const resultado = restaurarRespaldo(body.nombre);
    if (!resultado.ok) return responderJSON(res, resultado.codigo, { ok: false, error: resultado.error });
    return responderJSON(res, 200, { ok: true, proyectos: resultado.proyectos });
  },

  'GET /api/scan-bats': async (req, res) => {
    const { proyectos, detectados } = sincronizarBatsEnProyectos();
    return responderJSON(res, 200, { ok: true, detectados, totalProyectos: proyectos.length, proyectos });
  },

  'GET /api/free-port': async (req, res, url) => {
    const basePort = Number(url.searchParams.get('base')) || 3000;
    const projectId = String(url.searchParams.get('id') || '').trim();
    const proyectos = leerProyectos();
    const puertosCatalogo = obtenerPuertosOcupadosCatalogo(proyectos, projectId);
    const { puertoSugerido, puertoLibreTCP } = await encontrarPuertoLibre(basePort + 1, puertosCatalogo);
    const baseOcupado = await verificarPuerto(basePort);
    return responderJSON(res, 200, { ok: true, basePort, baseOcupado, puertoSugerido, puertoLibreTCP });
  },

  'POST /api/change-port': async (req, res) => {
    const body = await leerBodyJSON(req);
    const { proyectos, proyecto } = buscarProyectoPorId(body.id);
    if (!proyecto) return responderJSON(res, 404, { ok: false, error: 'Proyecto no encontrado.' });

    const puertoAnterior = proyecto.puerto;
    let nuevoPuerto = Number(body.nuevoPuerto);

    if (body.auto) {
      nuevoPuerto = await reasignarPuertoLibreAProyecto(proyecto, proyectos);
    } else {
      if (!Number.isInteger(nuevoPuerto) || nuevoPuerto < 1 || nuevoPuerto > 65535) {
        return responderJSON(res, 400, { ok: false, error: 'El puerto debe ser un número entero entre 1 y 65535.' });
      }
      if (nuevoPuerto === obtenerPuertoPanel()) {
        return responderJSON(res, 400, { ok: false, error: `El puerto ${nuevoPuerto} lo usa el propio panel.` });
      }
      proyecto.puerto = nuevoPuerto;
      proyecto.urlBase = actualizarUrlConPuerto(proyecto.urlBase, nuevoPuerto);
      guardarProyectos(proyectos);
    }

    if (duenosPuerto.get(Number(puertoAnterior)) === proyecto.id) duenosPuerto.delete(Number(puertoAnterior));
    const ocupadoActualmente = await verificarPuerto(nuevoPuerto);

    return responderJSON(res, 200, {
      ok: true,
      id: proyecto.id,
      puertoAnterior,
      nuevoPuerto,
      urlBase: proyecto.urlBase,
      ocupadoActualmente,
      proyecto
    });
  },

  'POST /api/start-project': async (req, res) => {
    const body = await leerBodyJSON(req);
    const { codigo, data } = await iniciarProyecto(body);
    return responderJSON(res, codigo, data);
  },

  'GET /api/login-as/estado': async (req, res) => {
    return responderJSON(res, 200, { ok: true, disponible: inicioAutomaticoDisponible() });
  },

  'POST /api/login-as': async (req, res) => {
    const body = await leerBodyJSON(req);
    const { proyectos, proyecto } = buscarProyectoPorId(body.id);
    if (!proyecto) return responderJSON(res, 404, { ok: false, error: 'Proyecto no encontrado.' });
    const rol = (proyecto.roles || []).find((r) => r.id === String(body.rolId || ''));
    if (!rol) return responderJSON(res, 404, { ok: false, error: 'Rol no encontrado.' });
    if (!rolEsAutomatizable(rol)) {
      return responderJSON(res, 400, {
        ok: false,
        codigo: 'NO_AUTOMATIZABLE',
        error: `El rol ${rol.rol} no tiene una contraseña fija que se pueda escribir automáticamente.`
      });
    }
    if (!inicioAutomaticoDisponible()) {
      return responderJSON(res, 503, {
        ok: false,
        codigo: 'SIN_PLAYWRIGHT',
        error: 'Falta instalar el componente de inicio automático. En la carpeta del panel ejecuta: npm install'
      });
    }

    // 1. Asegurar que el sistema esté encendido (y que el puerto no sea de otro sistema).
    const puerto = Number(proyecto.puerto);
    const dueno = duenosPuerto.get(puerto);
    if (dueno && dueno !== proyecto.id && (await verificarPuerto(puerto))) {
      return responderJSON(res, 409, {
        ok: false,
        codigo: 'PUERTO_OCUPADO',
        error: `El puerto ${puerto} lo está usando ${nombreProyecto(proyectos, dueno)}. Detenlo antes de entrar a ${proyecto.nombre}.`
      });
    }

    let arranque = null;
    if (!(await verificarPuerto(puerto))) {
      if (body.autoIniciar === false) {
        return responderJSON(res, 409, { ok: false, codigo: 'APAGADO', error: `${proyecto.nombre} está apagado.` });
      }
      arranque = await iniciarProyecto({ id: proyecto.id, esperar: true });
      if (!arranque.data.ok) return responderJSON(res, arranque.codigo, arranque.data);
      if (!arranque.data.online && !(await esperarEstadoPuerto(puerto, true, 80, 500))) {
        return responderJSON(res, 504, {
          ok: false,
          codigo: 'NO_ARRANCO',
          error: `Se ejecutó ${arranque.data.ejecutado}, pero ${proyecto.nombre} no respondió en el puerto ${puerto}. Revisa la ventana del .bat.`
        });
      }
      // Dar un respiro para que termine de cargar después de abrir el puerto.
      await esperarMs(800);
    }

    // 2. Abrir la ventana y escribir las credenciales.
    try {
      const resultado = await iniciarSesionRol(proyecto, rol);
      return responderJSON(res, 200, { ok: resultado.estado !== 'fallo', iniciado: Boolean(arranque), ...resultado });
    } catch (err) {
      return responderJSON(res, err.codigo === 'URL_NO_LOCAL' ? 400 : 503, {
        ok: false,
        codigo: err.codigo || 'ERROR',
        error: err.message
      });
    }
  },

  'POST /api/stop-project': async (req, res) => {
    const body = await leerBodyJSON(req);
    const { codigo, data } = await detenerProyecto(body.id);
    return responderJSON(res, codigo, data);
  },

  'GET /api/status': async (req, res) => {
    const proyectos = leerProyectos();
    const puertos = await obtenerPuertosActivos(proyectos);
    return responderJSON(res, 200, {
      ok: true,
      puertos,
      estados: calcularEstadosProyectos(proyectos, puertos),
      timestamp: new Date().toISOString()
    });
  },

  'GET /api/audit': async (req, res, url) =>
    conBloqueo('auditoria', res, async () => {
      const targetId = url.searchParams.get('id');
      if (targetId) {
        const { proyecto } = buscarProyectoPorId(targetId);
        if (!proyecto) return responderJSON(res, 404, { ok: false, error: 'Proyecto no encontrado' });
        const reporte = await auditarProyecto(proyecto);
        return responderJSON(res, 200, { ok: true, reportes: [reporte] });
      }
      const reportes = await auditarTodosLosProyectos(leerProyectos());
      return responderJSON(res, 200, { ok: true, reportes });
    }),

  'POST /api/load-test': async (req, res) => {
    const body = await leerBodyJSON(req);
    return conBloqueo('carga', res, async () => {
      const maxUsuarios = Number(body.maxUsuarios) || 200;
      const modo = body.modo === 'fijo' ? 'fijo' : 'escalera';
      const { proyecto } = buscarProyectoPorId(body.id);
      if (!proyecto) return responderJSON(res, 404, { ok: false, error: 'Proyecto no encontrado.' });
      const resultado = await ejecutarPruebaCargaProyecto(proyecto, { maxUsuarios, modo });
      return responderJSON(res, 200, resultado);
    });
  },

  'POST /api/detect-project': async (req, res) => {
    const body = await leerBodyJSON(req);
    const validacion = resolverRutaProyectoSegura(body.carpetaLocal);
    if (!validacion.ok) return responderJSON(res, validacion.codigo, { ok: false, error: validacion.error });
    if (!fs.statSync(validacion.rutaAbsoluta).isDirectory()) {
      return responderJSON(res, 400, { ok: false, error: 'La ruta no es una carpeta.' });
    }
    const carpetaLocal = String(body.carpetaLocal).trim();
    const { batInicio } = detectarBatsEnCarpetaProyecto(carpetaLocal);
    const datos = detectarDatosDesdeCarpeta(validacion.rutaAbsoluta, { batInicio });
    const ficha = analizarCarpetaProyecto(carpetaLocal);
    const stack = ficha && ficha.stackResumen && ficha.stackResumen[0] !== 'Web App' ? ficha.stackResumen : [];

    const idActual = String(body.id || '').trim();
    const ocupante = datos.puerto
      ? leerProyectos().find((p) => p.id !== idActual && Number(p.puerto) === datos.puerto)
      : null;

    return responderJSON(res, 200, {
      ok: true,
      proyecto: { ...datos, stack },
      puertoOcupadoPor: ocupante ? ocupante.nombre : null
    });
  },

  'POST /api/open-folder': async (req, res) => {
    const body = await leerBodyJSON(req);
    const validacion = resolverRutaProyectoSegura(body.carpetaLocal);
    if (!validacion.ok) return responderJSON(res, validacion.codigo, { ok: false, error: validacion.error });
    if (process.platform === 'win32') execFile('explorer.exe', [validacion.rutaAbsoluta], () => {});
    return responderJSON(res, 200, { ok: true, ruta: validacion.rutaAbsoluta });
  }
};

module.exports = {
  rutas
};
