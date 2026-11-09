'use strict';

/**
 * Punto de integración de utilidades del proyecto (re-exporta los módulos de src/).
 */

const rutasSistema = require('../src/config/rutas-sistema');
const archivos = require('../src/utils/archivos');
const urls = require('../src/utils/urls');
const cli = require('../src/utils/cli');
const validacion = require('../src/services/catalogo/validacion');
const repositorio = require('../src/services/catalogo/repositorio');

module.exports = {
  ...rutasSistema,
  ...archivos,
  ...urls,
  ...cli,
  ...validacion,
  ...repositorio
};
