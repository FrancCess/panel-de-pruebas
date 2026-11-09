'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFile, spawn } = require('node:child_process');
const {
  PUBLIC_DIR,
  DATA_FILE,
  estaDentroDeDirectorio,
  leerProyectos,
  guardarProyectos,
  listarRespaldos,
  restaurarRespaldo,
  validarCatalogo,
  validarComandoInicio,
  resolverRutaProyectoSegura,
  debeIgnorarDirectorio,
  actualizarUrlConPuerto,
  obtenerPuertosOcupadosCatalogo
} = require('./scripts/utils-proyectos');
const { auditarProyecto, auditarTodosLosProyectos } = require('./scripts/auditoria-seguridad');
const { ejecutarPruebaCargaProyecto } = require('./scripts/prueba-carga');
const { enriquecerProyectosConFichaTecnica, analizarCarpetaProyecto } = require('./scripts/detector-ficha-tecnica');
const { detectarDatosDesdeCarpeta } = require('./scripts/detector-proyecto');
const {
  inicioAutomaticoDisponible,
  rolEsAutomatizable,
  iniciarSesionRol,
  cerrarNavegador
} = require('./scripts/inicio-sesion');

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

// Puerto real en el que quedó escuchando el panel (puede no ser 4500 si estaba ocupado).
let puertoPanel = null;

// Qué proyecto inició el panel en cada puerto. Sirve para distinguir sistemas que comparten puerto.
const duenosPuerto = new Map();

// Evita lanzar dos auditorías o dos pruebas de carga a la vez.
const operacionesEnCurso = new Set();

// --- SEGURIDAD DE PETICIONES -------------------------------------------------

function hostsPermitidos() {
  const puerto = puertoPanel || DEFAULT_PORT;
  return new Set([`localhost:${puerto}`, `127.0.0.1:${puerto}`, `[::1]:${puerto}`]);
}

function origenesPermitidos() {
  return new Set([...hostsPermitidos()].map((h) => `http://${h}`));
}

/**
 * Bloquea:
 *  - DNS rebinding: el header Host debe ser exactamente localhost/127.0.0.1 con el puerto del panel.
 *  - CSRF: una página de otro sitio no puede llamar a la API (Origin y Sec-Fetch-Site).
 *  - Peticiones "simples" sin preflight: los POST deben ser application/json.
 */
function validarPeticion(req, esApi) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!hostsPermitidos().has(host)) {
    return { ok: false, codigo: 421, error: 'Host no permitido. Abre el panel desde http://localhost.' };
  }

  if (!esApi) return { ok: true };

  const origin = req.headers.origin;
  if (origin && !origenesPermitidos().has(String(origin).toLowerCase())) {
    return { ok: false, codigo: 403, error: 'Origen no permitido.' };
  }

  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && !['same-origin', 'none'].includes(String(fetchSite))) {
    return { ok: false, codigo: 403, error: 'Petición entre sitios bloqueada.' };
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const tipo = String(req.headers['content-type'] || '').toLowerCase();
    if (!tipo.startsWith('application/json')) {
      return { ok: false, codigo: 415, error: 'Las peticiones deben enviarse como application/json.' };
    }
  }

  return { ok: true };
}

// --- DETECCIÓN DE SCRIPTS .BAT -----------------------------------------------

const NOMBRES_BAT_PRIORITARIOS = [
  'iniciar-sistema.bat',
  'iniciar_sistema.bat',
  'iniciar.bat',
  'iniciar-app.bat',
  'start.bat',
  'run.bat'
];

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

const mismaRuta = (a, b) => String(a || '').toLowerCase().replace(/\//g, '\\') === String(b || '').toLowerCase().replace(/\//g, '\\');

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

// --- PUERTOS -----------------------------------------------------------------

function verificarPuertoEnHost(port, host, timeout = 450) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (online) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(online);
      }
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));

    socket.connect(port, host);
  });
}

async function verificarPuerto(port) {
  const numPort = Number(port);
  if (!Number.isInteger(numPort) || numPort <= 0 || numPort > 65535) {
    return false;
  }
  const ipv4 = await verificarPuertoEnHost(numPort, '127.0.0.1');
  if (ipv4) return true;
  return verificarPuertoEnHost(numPort, '::1');
}

function esperarMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function esperarEstadoPuerto(puerto, activoEsperado, maxIntentos, intervaloMs = 450) {
  for (let i = 0; i < maxIntentos; i++) {
    if ((await verificarPuerto(puerto)) === activoEsperado) return true;
    await esperarMs(intervaloMs);
  }
  return false;
}

async function encontrarPuertoLibre(puertoInicial = 3001, puertosEvitar = new Set()) {
  let candidato = Math.max(1024, Number(puertoInicial) || 3001);
  let primerLibreTCP = null;

  for (let i = 0; i < 150 && candidato <= 65535; i++, candidato++) {
    if (candidato === (puertoPanel || DEFAULT_PORT)) continue;
    const enUso = await verificarPuerto(candidato);
    if (!enUso) {
      if (primerLibreTCP === null) primerLibreTCP = candidato;
      if (!puertosEvitar.has(candidato)) {
        return { puertoSugerido: candidato, puertoLibreTCP: primerLibreTCP };
      }
    }
  }

  return {
    puertoSugerido: primerLibreTCP || 3050,
    puertoLibreTCP: primerLibreTCP || 3050
  };
}

/**
 * Busca y asigna un puerto libre a un proyecto evitando colisiones con otros proyectos del catálogo.
 */
async function reasignarPuertoLibreAProyecto(proyecto, proyectos) {
  const puertosCatalogo = obtenerPuertosOcupadosCatalogo(proyectos, proyecto.id);
  const { puertoSugerido } = await encontrarPuertoLibre((Number(proyecto.puerto) || 3000) + 1, puertosCatalogo);
  proyecto.puerto = puertoSugerido;
  proyecto.urlBase = actualizarUrlConPuerto(proyecto.urlBase, puertoSugerido);
  guardarProyectos(proyectos);
  return puertoSugerido;
}

/**
 * Calcula el estado de cada proyecto a partir de los puertos activos y de quién los inició:
 *  - online:        el puerto responde y el proyecto lo usa en exclusiva o el panel lo inició.
 *  - sin-confirmar: el puerto responde, pero lo comparten varios sistemas y no se sabe cuál es.
 *  - ocupado:       el puerto responde, pero el panel sabe que lo inició otro sistema.
 *  - apagado:       el puerto no responde.
 */
function calcularEstadosProyectos(proyectos, puertosActivos) {
  const porPuerto = new Map();
  for (const p of proyectos) {
    const k = Number(p.puerto);
    if (!porPuerto.has(k)) porPuerto.set(k, []);
    porPuerto.get(k).push(p.id);
  }

  const estados = {};
  for (const p of proyectos) {
    const puerto = Number(p.puerto);
    const activo = Boolean(puertosActivos[puerto]);
    const dueno = duenosPuerto.get(puerto);
    const compartido = (porPuerto.get(puerto) || []).length > 1;

    let estado = 'apagado';
    let ocupadoPor = null;
    if (activo) {
      if (dueno === p.id || (!dueno && !compartido)) estado = 'online';
      else if (dueno) {
        estado = 'ocupado';
        ocupadoPor = dueno;
      } else estado = 'sin-confirmar';
    }
    estados[p.id] = { estado, puerto, compartido, ocupadoPor };
  }
  return estados;
}

async function obtenerPuertosActivos(proyectos) {
  const puertosUnicos = [...obtenerPuertosOcupadosCatalogo(proyectos)];
  const resultados = {};
  await Promise.all(
    puertosUnicos.map(async (puerto) => {
      resultados[puerto] = await verificarPuerto(puerto);
    })
  );
  // Si un puerto se apagó, se olvida quién lo había iniciado.
  for (const puerto of [...duenosPuerto.keys()]) {
    if (resultados[puerto] === false) duenosPuerto.delete(puerto);
  }
  return resultados;
}

// --- PROCESOS ----------------------------------------------------------------

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

// --- HTTP --------------------------------------------------------------------

function leerBodyJSON(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamano = 0;
    let abortado = false;
    req.on('data', (chunk) => {
      if (abortado) return;
      tamano += chunk.length;
      if (tamano > MAX_BODY_BYTES) {
        abortado = true;
        reject(Object.assign(new Error('Payload demasiado grande'), { codigo: 413 }));
        req.resume();
        return;
      }
      partes.push(chunk);
    });
    req.on('end', () => {
      if (abortado) return;
      const body = Buffer.concat(partes).toString('utf8');
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { codigo: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function responderJSON(res, status, data) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function buscarProyectoPorId(id) {
  const limpio = String(id || '').trim();
  const proyectos = leerProyectos();
  const proyecto = proyectos.find((p) => p.id === limpio) || null;
  return { proyectos, proyecto, id: limpio };
}

function nombreProyecto(proyectos, id) {
  const p = proyectos.find((x) => x.id === id);
  return p ? p.nombre : id;
}

async function conBloqueo(clave, res, fn) {
  if (operacionesEnCurso.has(clave)) {
    return responderJSON(res, 409, {
      ok: false,
      error: 'Ya hay una operación de este tipo en curso. Espera a que termine.'
    });
  }
  operacionesEnCurso.add(clave);
  try {
    return await fn();
  } finally {
    operacionesEnCurso.delete(clave);
  }
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
    return { codigo: 409, data: {
      ok: false,
      conflicto: true,
      ocupadoPor: dueno,
      error: `El puerto ${puerto} está ocupado por ${nombreProyecto(proyectos, dueno)}. Detenlo o mueve este sistema a un puerto libre.`
    } };
  }

  if (yaActivo && body.autoPuertoLibre) {
    puerto = await reasignarPuertoLibreAProyecto(proyecto, proyectos);
    yaActivo = false;
  }

  if (yaActivo && reiniciar) {
    const rutaDetener = resolverBatSeguro(rutaAbsoluta, proyecto.archivoBatDetener);
    if (!rutaDetener) {
      return { codigo: 409, data: {
        ok: false,
        error: 'Este sistema no tiene un script .bat de detención. Ciérralo manualmente y vuelve a activarlo.'
      } };
    }
    lanzarProcesoDesacoplado(['/c', 'start', '""', path.basename(rutaDetener)], path.dirname(rutaDetener));
    const seApago = await esperarEstadoPuerto(puerto, false, 22);
    if (!seApago) {
      return { codigo: 504, data: {
        ok: false,
        error: `Se ejecutó ${proyecto.archivoBatDetener}, pero el puerto ${puerto} sigue activo.`
      } };
    }
    duenosPuerto.delete(puerto);
    yaActivo = false;
  }

  if (yaActivo) {
    return { codigo: 200, data: {
      ok: true,
      yaEstabaActivo: true,
      online: true,
      sinConfirmar: !dueno && obtenerPuertosOcupadosCatalogo(proyectos, proyecto.id).has(puerto),
      puerto,
      urlBase: proyecto.urlBase,
      mensaje: `El puerto ${puerto} ya está en uso.`
    } };
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
    return { codigo: 400, data: {
      ok: false,
      error: 'No se encontró archivo .bat ni comando de inicio para este proyecto.'
    } };
  }

  duenosPuerto.set(puerto, proyecto.id);

  let online = false;
  if (esperar && puerto) {
    online = await esperarEstadoPuerto(puerto, true, 16);
  }

  return { codigo: 200, data: {
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
  } };
}

// --- RUTAS DE LA API ---------------------------------------------------------

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
      if (nuevoPuerto === puertoPanel) {
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
    const { proyecto } = buscarProyectoPorId(body.id);
    if (!proyecto) return responderJSON(res, 404, { ok: false, error: 'Proyecto no encontrado.' });

    const validacion = resolverRutaProyectoSegura(proyecto.carpetaLocal);
    if (!validacion.ok) return responderJSON(res, validacion.codigo, { ok: false, error: validacion.error });

    const infoBat = detectarBatsEnCarpetaProyecto(proyecto.carpetaLocal);
    const rutaDetener = resolverBatSeguro(validacion.rutaAbsoluta, proyecto.archivoBatDetener || infoBat.batDetener);
    if (!rutaDetener) {
      return responderJSON(res, 400, { ok: false, error: 'Este proyecto no cuenta con un script .bat de detención.' });
    }

    lanzarProcesoDesacoplado(['/c', 'start', '""', path.basename(rutaDetener)], path.dirname(rutaDetener));
    const seApago = await esperarEstadoPuerto(proyecto.puerto, false, 10);
    if (seApago) duenosPuerto.delete(Number(proyecto.puerto));
    return responderJSON(res, 200, {
      ok: true,
      ejecutado: path.relative(validacion.rutaAbsoluta, rutaDetener),
      online: !seApago
    });
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

// --- ARCHIVOS ESTÁTICOS ------------------------------------------------------

function servirEstatico(pathname, res) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  try {
    safePath = decodeURIComponent(safePath);
  } catch {
    res.writeHead(400, SECURITY_HEADERS);
    return res.end('Ruta inválida');
  }
  safePath = path.normalize(safePath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!estaDentroDeDirectorio(filePath, PUBLIC_DIR)) {
    res.writeHead(403, SECURITY_HEADERS);
    return res.end('Acceso denegado');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Archivo no encontrado');
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    };
    if (ext === '.html') headers['Content-Security-Policy'] = CSP_HTML;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, 'http://localhost');
  } catch {
    return responderJSON(res, 400, { ok: false, error: 'URL inválida' });
  }
  const pathname = parsedUrl.pathname;
  const esApi = pathname.startsWith('/api/');

  const control = validarPeticion(req, esApi);
  if (!control.ok) {
    if (esApi) return responderJSON(res, control.codigo, { ok: false, error: control.error });
    res.writeHead(control.codigo, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(control.error);
  }

  if (esApi) {
    const manejador = rutas[`${req.method} ${pathname}`];
    if (!manejador) return responderJSON(res, 404, { ok: false, error: 'Ruta de API no encontrada.' });
    try {
      return await manejador(req, res, parsedUrl);
    } catch (err) {
      if (!res.headersSent) {
        return responderJSON(res, err.codigo || 500, { ok: false, error: err.message });
      }
      return undefined;
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, SECURITY_HEADERS);
    return res.end('Método no permitido');
  }
  return servirEstatico(pathname, res);
});

/**
 * Abre el navegador en la URL real del panel (en Windows). Así funciona aunque el panel
 * haya tenido que usar otro puerto porque el 4500 estaba ocupado.
 */
function abrirNavegador(url) {
  if (process.platform !== 'win32') return;
  execFile('explorer.exe', [url], () => {});
}

function iniciarServidor(puerto, { abrir = false, reintentos = MAX_REINTENTOS_PUERTO } = {}) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && reintentos > 0) {
      console.log(`Puerto ${puerto} en uso, intentando con ${puerto + 1}...`);
      iniciarServidor(puerto + 1, { abrir, reintentos: reintentos - 1 });
    } else {
      console.error('Error al iniciar el servidor:', err.message);
      process.exitCode = 1;
    }
  });

  server.listen(puerto, '127.0.0.1', () => {
    puertoPanel = server.address().port;
    const url = `http://localhost:${puertoPanel}`;
    let detectados = 0;
    try {
      ({ detectados } = sincronizarBatsEnProyectos());
    } catch (err) {
      console.error('No se pudieron escanear los proyectos:', err.message);
    }
    console.log('==========================================================');
    console.log('  PANEL CENTRAL DE PRUEBAS WEB ACTIVO');
    console.log(`  URL: ${url}`);
    console.log(`  Scripts .bat de inicio detectados: ${detectados}`);
    console.log(`  Datos: ${DATA_FILE}`);
    console.log('  Cierra esta ventana para apagar el panel.');
    console.log('==========================================================');
    if (abrir) abrirNavegador(url);
  });
}

/** Permite a las pruebas fijar el puerto del panel cuando escuchan en un puerto aleatorio. */
function registrarPuertoPanel(puerto) {
  puertoPanel = puerto;
}

if (require.main === module) {
  iniciarServidor(DEFAULT_PORT, { abrir: process.argv.includes('--abrir') });
  const salir = () => {
    cerrarNavegador().finally(() => process.exit(0));
  };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}

module.exports = {
  server,
  iniciarServidor,
  registrarPuertoPanel,
  validarPeticion,
  calcularEstadosProyectos,
  duenosPuerto,
  detectarBatsEnCarpetaProyecto,
  sincronizarBatsEnProyectos,
  verificarPuerto
};
