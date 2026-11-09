'use strict';

/**
 * Detector Automático de Tecnologías y Generador de Ficha Técnica por Proyecto
 *
 * Inspecciona la carpeta local de cada proyecto (package.json, composer.json,
 * requirements.txt, esquemas SQL, migraciones, vistas y código fuente) para
 * construir automáticamente su Ficha Técnica completa.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  leerJSONSeguro,
  resolverRutaProyectoSegura,
  buscarArchivosCodigo
} = require('../../utils/archivos');

function limpiarVersion(ver) {
  return String(ver || '').replace(/^[\^~>=<]+/, '').trim();
}

function analizarCarpetaProyecto(carpetaLocal) {
  const validacion = resolverRutaProyectoSegura(carpetaLocal);
  if (!validacion.ok) return null;
  const { rutaAbsoluta } = validacion;

  const lenguajes = new Set();
  const backend = new Set();
  const frontend = new Set();
  const baseDatos = new Set();
  const libreriasClave = new Set();
  const seguridad = new Set();
  const tablasDetectadas = new Set();

  let versionProyecto = '1.0.0';
  let autorProyecto = 'Francisco Javier Córdova Altamirano';
  let motorRuntime = '';
  let tipoArquitectura = 'Aplicación Web Cliente-Servidor';
  let scriptsDisponibles = [];

  // 1. Analizar package.json (Node.js / Frontend / Electron)
  const pkg = leerJSONSeguro(path.join(rutaAbsoluta, 'package.json'));
  if (pkg) {
    if (pkg.version) versionProyecto = pkg.version;
    if (typeof pkg.author === 'string' && pkg.author.trim()) autorProyecto = pkg.author.trim();
    motorRuntime = pkg.engines?.node ? `Node.js (${pkg.engines.node})` : 'Node.js';
    if (pkg.scripts) {
      scriptsDisponibles = Object.keys(pkg.scripts);
    }

    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const tieneDep = (nombre) => Boolean(deps[nombre]);
    const verDep = (nombre) => (deps[nombre] ? ` v${limpiarVersion(deps[nombre]).split('.')[0]}` : '');

    lenguajes.add('JavaScript (ES6+)');
    if (tieneDep('typescript')) lenguajes.add(`TypeScript${verDep('typescript')}`);

    // Backend / Runtime
    if (tieneDep('express')) backend.add(`Express${verDep('express')}`);
    if (tieneDep('socket.io')) {
      backend.add(`Socket.io${verDep('socket.io')} (WebSockets)`);
      tipoArquitectura = 'Aplicación Web en Tiempo Real (Event-Driven / WebSockets)';
    }
    if (tieneDep('electron')) {
      backend.add(`Electron${verDep('electron')}`);
      tipoArquitectura = 'Aplicación Híbrida Web / Escritorio (Electron)';
    }

    // Frontend
    if (tieneDep('react')) {
      frontend.add(`React${verDep('react')}`);
      tipoArquitectura = tieneDep('electron')
        ? 'SPA React + Escritorio (Electron)'
        : 'Single Page Application (React)';
    }
    if (tieneDep('vite')) frontend.add(`Vite${verDep('vite')}`);
    if (tieneDep('tailwindcss') || tieneDep('@tailwindcss/vite') || tieneDep('@tailwindcss/cli')) {
      frontend.add(`Tailwind CSS${verDep('tailwindcss')}`);
    }
    if (tieneDep('lucide-react')) frontend.add('Lucide Icons');

    // Base de datos
    if (tieneDep('mysql2') || tieneDep('mysql')) {
      baseDatos.add('MySQL / MariaDB (mysql2)');
      lenguajes.add('SQL');
    }
    if (tieneDep('better-sqlite3') || tieneDep('sqlite3')) {
      baseDatos.add('SQLite 3');
      lenguajes.add('SQL');
    }

    // Seguridad
    if (tieneDep('helmet')) seguridad.add('Helmet (Cabeceras HTTP)');
    if (tieneDep('bcrypt') || tieneDep('bcryptjs')) seguridad.add('Bcrypt (Hash Criptográfico)');
    if (tieneDep('express-session')) seguridad.add('Express-Session');

    // Librerías especializadas
    const mapaLibrerias = [
      ['pdfkit', 'PDFKit (Generación de PDF)'],
      ['pdf-to-printer', 'PDF-to-Printer (Impresión directa)'],
      ['qrcode', 'QRCode (Generador QR)'],
      ['mammoth', 'Mammoth (Importador Word .docx)'],
      ['pdfjs-dist', 'PDF.js (Lector PDF)'],
      ['archiver', 'Archiver (Compresión de respaldos ZIP)'],
      ['multer', 'Multer (Carga de archivos)']
    ];
    for (const [dep, etiqueta] of mapaLibrerias) {
      if (tieneDep(dep)) libreriasClave.add(etiqueta);
    }
  }

  // 2. Analizar composer.json (PHP / Laravel)
  const composer = leerJSONSeguro(path.join(rutaAbsoluta, 'composer.json'));
  if (composer) {
    const req = { ...(composer.require || {}), ...(composer['require-dev'] || {}) };
    lenguajes.add('PHP');
    if (req.php) motorRuntime = `PHP (${req.php})`;
    if (req['laravel/framework']) {
      backend.add(`Laravel v${limpiarVersion(req['laravel/framework']).split('.')[0]}`);
      frontend.add('Blade Templates');
      baseDatos.add('Eloquent ORM (SQLite / MySQL)');
      seguridad.add('Laravel Auth & CSRF Protection');
      seguridad.add('Policies RBAC por Solicitud');
      tipoArquitectura = 'Arquitectura MVC Monolítica (Laravel)';
    }
    if (req['setasign/fpdi'] || req['setasign/fpdf']) {
      libreriasClave.add('FPDI / FPDF (Plantillas PDF Institucionales)');
    }
    if (req['phpoffice/phpspreadsheet'] || req['maatwebsite/excel']) {
      libreriasClave.add('PhpSpreadsheet (Importación/Exportación Excel)');
    }
    if (req['phpunit/phpunit']) {
      libreriasClave.add('PHPUnit (Pruebas Automatizadas)');
    }
  }

  // 3. Analizar requirements.txt o archivos Python
  const reqTxtPath = path.join(rutaAbsoluta, 'requirements.txt');
  const reqBackendPath = path.join(rutaAbsoluta, 'backend', 'requirements.txt');
  const rutaReqPython = fs.existsSync(reqTxtPath)
    ? reqTxtPath
    : fs.existsSync(reqBackendPath)
    ? reqBackendPath
    : null;

  if (rutaReqPython) {
    const rawReq = fs.readFileSync(rutaReqPython, 'utf8');
    lenguajes.add('Python 3');
    if (!motorRuntime) motorRuntime = 'Python 3.10+';
    if (/flask/i.test(rawReq)) backend.add('Flask (Python Web Server)');
    if (/fastapi/i.test(rawReq)) backend.add('FastAPI');
    if (/pymupdf|fitz/i.test(rawReq)) libreriasClave.add('PyMuPDF (Análisis de Color por Página en PDF)');
    if (/flask-limiter/i.test(rawReq)) seguridad.add('Flask-Limiter (Rate Limiting)');
    if (/qrcode|pillow/i.test(rawReq)) libreriasClave.add('QRCode / Pillow (Procesamiento de Imagen)');
    if (/pytest/i.test(rawReq)) libreriasClave.add('Pytest');
  }

  // 4. Escaneo de archivos fuente para métricas (LOC, tablas SQL, estilos)
  const archivos = buscarArchivosCodigo(rutaAbsoluta, {
    maxDepth: 3,
    maxFiles: 250,
    maxSizeBytes: 350 * 1024,
    filtroArchivo: (name) => /\.(js|cjs|mjs|ts|tsx|php|py|html|css|sql)$/i.test(name)
  });

  let totalLineasCodigo = 0;
  const conteoPorExtension = {};

  for (const item of archivos) {
    conteoPorExtension[item.ext] = (conteoPorExtension[item.ext] || 0) + 1;

    try {
      const content = fs.readFileSync(item.fullPath, 'utf8');
      totalLineasCodigo += content.split(/\r?\n/).length;

      // Detectar CREATE TABLE en SQL / JS / PHP Migrations
      const matchesTabla = content.matchAll(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?([a-zA-Z0-9_]+)[`"']?\s*\(|Schema::create\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/gi
      );
      for (const m of matchesTabla) {
        const nombreTabla = (m[1] || m[2] || '').toLowerCase();
        if (nombreTabla && nombreTabla !== 'sqlite_sequence') {
          tablasDetectadas.add(nombreTabla);
        }
      }
    } catch {
      // Ignorar errores puntuales de lectura
    }
  }

  if (conteoPorExtension['.html']) lenguajes.add('HTML5');
  if (conteoPorExtension['.css']) lenguajes.add('CSS3');
  if (conteoPorExtension['.py']) lenguajes.add('Python 3');
  if (conteoPorExtension['.sql'] || tablasDetectadas.size > 0) lenguajes.add('SQL');

  if (frontend.size === 0 && (conteoPorExtension['.html'] || conteoPorExtension['.css'])) {
    frontend.add('HTML5 + CSS3 + Vanilla JS');
  }
  if (baseDatos.size === 0) {
    if (fs.existsSync(path.join(rutaAbsoluta, 'historial.db')) || tablasDetectadas.size > 0) {
      baseDatos.add('SQLite 3');
    } else if (fs.existsSync(path.join(rutaAbsoluta, 'data', 'rooms.json'))) {
      baseDatos.add('Persistencia JSON en Disco (rooms.json)');
    }
  }

  const stackResumen = [...backend, ...frontend, ...baseDatos].slice(0, 5);

  return {
    version: versionProyecto,
    autor: autorProyecto,
    motorRuntime: motorRuntime || 'Node.js / Web',
    tipoArquitectura,
    lenguajes: [...lenguajes],
    backend: [...backend],
    frontend: [...frontend],
    baseDatos: [...baseDatos],
    libreriasClave: [...libreriasClave],
    seguridad: [...seguridad],
    tablasBaseDatos: [...tablasDetectadas],
    scriptsNpm: scriptsDisponibles,
    metricas: {
      totalArchivosCodigo: archivos.length,
      lineasDeCodigo: totalLineasCodigo,
      desgloseArchivos: conteoPorExtension
    },
    stackResumen: stackResumen.length ? stackResumen : ['Web App']
  };
}

function enriquecerProyectosConFichaTecnica(proyectos) {
  let actualizados = 0;
  proyectos.forEach((p) => {
    const ficha = analizarCarpetaProyecto(p.carpetaLocal);
    if (ficha) {
      p.fichaTecnica = ficha;
      if (ficha.stackResumen && ficha.stackResumen.length > 0) {
        p.stack = ficha.stackResumen;
      }
      actualizados++;
    }
  });
  return { proyectos, actualizados };
}

module.exports = {
  analizarCarpetaProyecto,
  enriquecerProyectosConFichaTecnica
};
