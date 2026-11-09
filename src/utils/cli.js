'use strict';

/**
 * Utilidades para scripts de consola (CLI) y pausas asíncronas.
 */

/**
 * Parsea argumentos de línea de comandos tanto posicionales como con banderas (--proyecto=..., --max=..., --json).
 */
function parsearArgumentosCLI(argv = process.argv.slice(2)) {
  let filtro = '';
  let max = null;
  let json = false;

  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
    } else if (arg.startsWith('--proyecto=')) {
      filtro = arg.split('=')[1] || '';
    } else if (arg.startsWith('--max=')) {
      max = Number(arg.split('=')[1]) || null;
    } else if (!arg.startsWith('--')) {
      if (!filtro) {
        filtro = arg;
      } else if (max === null && !Number.isNaN(Number(arg))) {
        max = Number(arg);
      }
    }
  }

  return { filtro, max, json };
}

function esperarMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  parsearArgumentosCLI,
  esperarMs
};
