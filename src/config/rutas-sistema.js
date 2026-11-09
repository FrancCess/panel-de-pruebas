'use strict';

/**
 * Configuración centralizada de rutas de directorios, archivos de datos y límites del sistema.
 */

const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WORKSPACE_ROOT = path.resolve(ROOT_DIR, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// PANEL_DATA_DIR permite apuntar a otra carpeta de datos (lo usan las pruebas para no tocar el catálogo real).
const DATA_DIR_PERSONALIZADO = Boolean(process.env.PANEL_DATA_DIR);
const DATA_DIR = DATA_DIR_PERSONALIZADO ? path.resolve(process.env.PANEL_DATA_DIR) : path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'proyectos.json');

// Catálogo de ejemplo que se copia la primera vez (el catálogo real no se sube a GitHub).
const EJEMPLO_FILE = path.join(ROOT_DIR, 'data', 'proyectos.ejemplo.json');
const BACKUP_DIR = path.join(DATA_DIR, 'respaldos');
const MAX_RESPALDOS = 25;
const DEFAULT_DATA_JS_FILE = path.join(PUBLIC_DIR, 'js', 'default-data.js');

const LIMITES = {
  maxProyectos: 200,
  maxRolesPorProyecto: 50,
  maxTextoCorto: 200,
  maxTextoLargo: 2000
};

const IGNORED_DIRS = new Set([
  'node_modules',
  'vendor',
  '.git',
  '.venv',
  'venv',
  'dist',
  'build',
  'storage',
  '__pycache__',
  'backend-dist',
  '_to_delete'
]);

module.exports = {
  ROOT_DIR,
  WORKSPACE_ROOT,
  PUBLIC_DIR,
  DATA_DIR_PERSONALIZADO,
  DATA_DIR,
  DATA_FILE,
  EJEMPLO_FILE,
  BACKUP_DIR,
  MAX_RESPALDOS,
  DEFAULT_DATA_JS_FILE,
  LIMITES,
  IGNORED_DIRS
};
