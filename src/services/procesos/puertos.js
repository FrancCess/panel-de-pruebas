'use strict';

/**
 * Servicio de gestión de puertos TCP, resolución de colisiones y cálculo de estado en tiempo real.
 */

const net = require('node:net');
const { DEFAULT_PORT } = require('../../config/constantes');
const { actualizarUrlConPuerto, obtenerPuertosOcupadosCatalogo } = require('../../utils/urls');
const { esperarMs } = require('../../utils/cli');
const { guardarProyectos } = require('../catalogo/repositorio');

// Puerto real en el que quedó escuchando el panel (puede no ser 4500 si estaba ocupado).
let puertoPanel = null;

// Qué proyecto inició el panel en cada puerto. Sirve para distinguir sistemas que comparten puerto.
const duenosPuerto = new Map();

function registrarPuertoPanel(puerto) {
  puertoPanel = puerto;
}

function obtenerPuertoPanel() {
  return puertoPanel;
}

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

module.exports = {
  duenosPuerto,
  registrarPuertoPanel,
  obtenerPuertoPanel,
  verificarPuertoEnHost,
  verificarPuerto,
  esperarEstadoPuerto,
  encontrarPuertoLibre,
  reasignarPuertoLibreAProyecto,
  calcularEstadosProyectos,
  obtenerPuertosActivos
};
