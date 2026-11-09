'use strict';

/**
 * Motor de Pruebas de Carga, Concurrencia y Punto de Quiebre (Capacity & Stress Benchmark)
 * Diseñado exclusivamente para medir el rendimiento de proyectos locales (localhost / 127.0.0.1).
 */

const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');
const { esUrlLocalSegura, obtenerUrlsRutasProyecto } = require('../../utils/urls');

function peticionIndividual(urlDestino, agent, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const inicio = performance.now();
    const parsed = new URL(urlDestino);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      parsed,
      {
        method: 'GET',
        agent,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'PanelPruebas-LoadTester/1.0 (Local-Capacity-Benchmark)',
          Accept: 'text/html,application/json,*/*'
        }
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          const duracion = performance.now() - inicio;
          const exito = res.statusCode >= 200 && res.statusCode < 500;
          resolve({
            ok: exito,
            statusCode: res.statusCode,
            latenciaMs: duracion,
            tipoError: exito ? null : `HTTP_${res.statusCode}`
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        ok: false,
        statusCode: 0,
        latenciaMs: performance.now() - inicio,
        tipoError: 'TIMEOUT'
      });
    });

    req.on('error', (err) => {
      resolve({
        ok: false,
        statusCode: 0,
        latenciaMs: performance.now() - inicio,
        tipoError: err.code || 'ERROR_RED'
      });
    });

    req.end();
  });
}

function calcularPercentil(arregloOrdenado, percentil) {
  if (!arregloOrdenado.length) return 0;
  const idx = Math.min(
    arregloOrdenado.length - 1,
    Math.max(0, Math.ceil((percentil / 100) * arregloOrdenado.length) - 1)
  );
  return Math.round(arregloOrdenado[idx]);
}

/**
 * Ejecuta un escalón de N usuarios concurrentes durante `rondasPorUsuario` peticiones cada uno,
 * repartidos entre las rutas de los roles del sistema.
 */
async function ejecutarEscalonConcurrencia(urlsRutas, usuariosConcurrentes, rondasPorUsuario = 3) {
  const isHttps = urlsRutas[0].startsWith('https:');
  const AgentClass = isHttps ? https.Agent : http.Agent;
  const agent = new AgentClass({
    keepAlive: true,
    maxSockets: Math.min(usuariosConcurrentes, 500)
  });

  const resultados = [];
  const inicioEscalon = performance.now();

  const trabajadores = Array.from({ length: usuariosConcurrentes }, async (_, workerIdx) => {
    for (let r = 0; r < rondasPorUsuario; r++) {
      const url = urlsRutas[(workerIdx + r) % urlsRutas.length];
      const res = await peticionIndividual(url, agent, 3500);
      resultados.push(res);
    }
  });

  await Promise.all(trabajadores);
  const duracionTotalSeg = Math.max(0.05, (performance.now() - inicioEscalon) / 1000);
  agent.destroy();

  const totalPeticiones = resultados.length;
  const exitosas = resultados.filter((r) => r.ok).length;
  const fallidas = totalPeticiones - exitosas;
  const tasaErrorPct = totalPeticiones ? Math.round((fallidas / totalPeticiones) * 100) : 0;

  const latencias = resultados.map((r) => r.latenciaMs).sort((a, b) => a - b);
  const promedioMs = latencias.length
    ? Math.round(latencias.reduce((acc, v) => acc + v, 0) / latencias.length)
    : 0;
  const p50Ms = calcularPercentil(latencias, 50);
  const p95Ms = calcularPercentil(latencias, 95);
  const p99Ms = calcularPercentil(latencias, 99);
  const maxMs = latencias.length ? Math.round(latencias[latencias.length - 1]) : 0;
  const rps = Math.round(totalPeticiones / duracionTotalSeg);

  let estado = 'optimo'; // 'optimo' | 'degradado' | 'colapso'
  if (tasaErrorPct >= 20 || p95Ms >= 2200) {
    estado = 'colapso';
  } else if (tasaErrorPct > 0 || p95Ms >= 650) {
    estado = 'degradado';
  }

  return {
    usuarios: usuariosConcurrentes,
    peticionesTotales: totalPeticiones,
    exitosas,
    fallidas,
    tasaErrorPct,
    rps,
    promedioMs,
    p50Ms,
    p95Ms,
    p99Ms,
    maxMs,
    duracionSeg: Number(duracionTotalSeg.toFixed(2)),
    estado
  };
}

/**
 * Ejecuta una prueba completa de estrés progresiva (Ramp-Up) o personalizada sobre un proyecto.
 */
async function ejecutarPruebaCargaProyecto(proyecto, opciones = {}) {
  const urlBase = String(proyecto.urlBase || '').replace(/\/+$/, '');
  if (!esUrlLocalSegura(urlBase)) {
    throw new Error('Por seguridad, las pruebas de carga solo están permitidas sobre localhost / 127.0.0.1.');
  }

  // Cada URL (incluidas las rutas absolutas de los roles) debe ser local.
  const urlsPrueba = obtenerUrlsRutasProyecto(proyecto);
  if (urlsPrueba.some((u) => !esUrlLocalSegura(u))) {
    throw new Error('Por seguridad, las pruebas de carga solo están permitidas sobre localhost / 127.0.0.1.');
  }

  // Verificar primero con 1 petición que el sistema esté encendido
  const AgentClass = urlBase.startsWith('https:') ? https.Agent : http.Agent;
  const testAgent = new AgentClass();
  const pingInicial = await peticionIndividual(urlsPrueba[0], testAgent, 1800);
  testAgent.destroy();

  if (!pingInicial.ok && pingInicial.statusCode === 0) {
    return {
      ok: false,
      online: false,
      id: proyecto.id,
      nombre: proyecto.nombre,
      urlBase: proyecto.urlBase,
      puerto: proyecto.puerto,
      error: `El servidor de "${proyecto.nombre}" en el puerto :${proyecto.puerto} está apagado. Actívalo primero con su botón .bat antes de correr la simulación de usuarios.`
    };
  }

  // Definir escalones de usuarios simultáneos (máximo seguro 400 para entorno local)
  const maxUsuarios = Math.min(Math.max(Number(opciones.maxUsuarios) || 200, 10), 400);
  const modo = opciones.modo || 'escalera'; // 'escalera' | 'fijo'

  let escalonesConfig = [];
  if (modo === 'fijo') {
    escalonesConfig = [maxUsuarios];
  } else {
    const baseSteps = [10, 25, 50, 100, 150, 200, 300, 400];
    escalonesConfig = baseSteps.filter((n) => n <= maxUsuarios);
    if (!escalonesConfig.includes(maxUsuarios)) {
      escalonesConfig.push(maxUsuarios);
    }
  }

  const resultadosEscalones = [];
  let maxUsuariosEstables = 0;
  let puntoDegradacion = null;
  let puntoColapso = null;
  let rpsMaximo = 0;

  for (const numUsuarios of escalonesConfig) {
    const rondas = numUsuarios <= 50 ? 3 : 2;
    const resEscalon = await ejecutarEscalonConcurrencia(urlsPrueba, numUsuarios, rondas);
    resultadosEscalones.push(resEscalon);

    if (resEscalon.rps > rpsMaximo) {
      rpsMaximo = resEscalon.rps;
    }

    if (resEscalon.estado === 'optimo') {
      maxUsuariosEstables = numUsuarios;
    } else if (resEscalon.estado === 'degradado') {
      if (!puntoDegradacion) puntoDegradacion = numUsuarios;
    } else if (resEscalon.estado === 'colapso') {
      if (!puntoColapso) puntoColapso = numUsuarios;
      if (resEscalon.tasaErrorPct >= 35 || resEscalon.p95Ms >= 3000) {
        break;
      }
    }
  }

  let diagnostico = '';
  if (puntoColapso) {
    diagnostico = `El sistema soporta de forma óptima hasta ~${maxUsuariosEstables || 10} usuarios simultáneos. Presenta degradación en ${puntoDegradacion || puntoColapso} usuarios y alcanza saturación/colapso alrededor de los ${puntoColapso} usuarios concurrentes.`;
  } else if (puntoDegradacion) {
    diagnostico = `El sistema no colapsó hasta los ${maxUsuarios} usuarios probados, pero mostró incremento de latencia (degradación) a partir de ${puntoDegradacion} usuarios simultáneos. Capacidad óptima sin lentitud: ~${maxUsuariosEstables || 10} usuarios.`;
  } else {
    diagnostico = `Excelente estabilidad: el sistema respondió sin errores y con baja latencia hasta el límite probado de ${maxUsuarios} usuarios simultáneos (${rpsMaximo} peticiones/seg).`;
  }

  return {
    ok: true,
    online: true,
    id: proyecto.id,
    nombre: proyecto.nombre,
    urlBase: proyecto.urlBase,
    puerto: proyecto.puerto,
    rutasProbadas: urlsPrueba,
    fecha: new Date().toISOString(),
    resumen: {
      maxUsuariosProbados: resultadosEscalones[resultadosEscalones.length - 1]?.usuarios || maxUsuarios,
      usuariosOptimos: maxUsuariosEstables,
      puntoDegradacion,
      puntoColapso,
      rpsMaximo,
      diagnostico
    },
    escalones: resultadosEscalones
  };
}

module.exports = {
  peticionIndividual,
  ejecutarEscalonConcurrencia,
  ejecutarPruebaCargaProyecto
};
