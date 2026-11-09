'use strict';

/**
 * Punto de entrada principal del Panel Central de Pruebas Web.
 * La lógica del servidor, servicios y rutas se encuentra modularizada bajo src/.
 */

const { server, iniciarServidor } = require('./src/http/servidor');
const { validarPeticion } = require('./src/http/seguridad-http');
const {
  registrarPuertoPanel,
  calcularEstadosProyectos,
  duenosPuerto,
  verificarPuerto
} = require('./src/services/procesos/puertos');
const {
  detectarBatsEnCarpetaProyecto,
  sincronizarBatsEnProyectos
} = require('./src/services/procesos/scripts-bat');
const { cerrarNavegador } = require('./src/services/sesion/inicio-sesion');

const DEFAULT_PORT = Number(process.env.PORT) || 4500;

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
