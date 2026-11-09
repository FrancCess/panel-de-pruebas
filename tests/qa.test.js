'use strict';

/**
 * Suite Automatizada de Control de Calidad (QA)
 * Verifica utilidades, validación del catálogo, respaldos, protecciones de la API
 * (CSRF, DNS rebinding, comandos), estados de puertos, ficha técnica, auditoría y pruebas de carga.
 *
 * Las pruebas trabajan sobre una COPIA del catálogo en una carpeta temporal:
 * nunca modifican data/proyectos.json ni public/js/default-data.js.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Debe configurarse ANTES de cargar los módulos del panel.
// Usa tu catálogo si existe; en un clon recién descargado, el de ejemplo.
const DATA_PROPIO = path.join(__dirname, '..', 'data', 'proyectos.json');
const DATA_REAL = fs.existsSync(DATA_PROPIO) ? DATA_PROPIO : path.join(__dirname, '..', 'data', 'proyectos.ejemplo.json');
const DIR_TEMPORAL = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-qa-'));
fs.copyFileSync(DATA_REAL, path.join(DIR_TEMPORAL, 'proyectos.json'));
process.env.PANEL_DATA_DIR = DIR_TEMPORAL;

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  WORKSPACE_ROOT,
  DATA_FILE,
  estaDentroDeDirectorio,
  leerProyectos,
  guardarProyectos,
  listarRespaldos,
  restaurarRespaldo,
  validarCatalogo,
  validarComandoInicio,
  validarRutaAcceso,
  parsearArgumentosCLI,
  filtrarProyectosPorTermino,
  resolverRutaProyectoSegura,
  esUrlLocalSegura,
  construirUrlRol,
  obtenerUrlsRutasProyecto,
  actualizarUrlConPuerto,
  obtenerPuertosOcupadosCatalogo
} = require('../scripts/utils-proyectos');

const { analizarCarpetaProyecto } = require('../scripts/detector-ficha-tecnica');
const { auditarProyecto } = require('../scripts/auditoria-seguridad');
const { ejecutarPruebaCargaProyecto } = require('../scripts/prueba-carga');
const { server, registrarPuertoPanel, calcularEstadosProyectos, duenosPuerto } = require('../server');

const contenidoRealInicial = fs.readFileSync(DATA_REAL, 'utf8');

after(() => {
  fs.rmSync(DIR_TEMPORAL, { recursive: true, force: true });
});

describe('0. Aislamiento de las pruebas', () => {
  it('usa una carpeta de datos temporal y no el catálogo real', () => {
    assert.equal(path.dirname(DATA_FILE), DIR_TEMPORAL);
  });
});

describe('1. Utilidades Compartidas y Controles de Seguridad (utils-proyectos)', () => {
  it('valida correctamente hosts locales y bloquea dominios externos (prevención SSRF)', () => {
    assert.equal(esUrlLocalSegura('http://localhost:3000/login'), true);
    assert.equal(esUrlLocalSegura('http://127.0.0.1:8000'), true);
    assert.equal(esUrlLocalSegura('http://[::1]:4500'), true);
    assert.equal(esUrlLocalSegura('https://example.com'), false);
    assert.equal(esUrlLocalSegura('http://192.168.1.50:3000'), false);
    assert.equal(esUrlLocalSegura('url-invalida'), false);
  });

  it('previene Path Traversal fuera de WORKSPACE_ROOT en resolverRutaProyectoSegura', () => {
    const intentoEscape = resolverRutaProyectoSegura(path.join('..', '..', '..', '..', 'Windows', 'System32'));
    assert.equal(intentoEscape.ok, false);
    assert.equal(intentoEscape.codigo, 403);

    const vacia = resolverRutaProyectoSegura('   ');
    assert.equal(vacia.ok, false);
    assert.equal(vacia.codigo, 400);
  });

  it('previene bypass por prefijo parcial en estaDentroDeDirectorio', () => {
    const base = path.join(WORKSPACE_ROOT, 'panel de pruebas');
    const hermanoMalicioso = path.join(WORKSPACE_ROOT, 'panel de pruebas-hack', 'secreto.txt');
    const hijoValido = path.join(base, 'public', 'index.html');

    assert.equal(estaDentroDeDirectorio(hijoValido, base), true);
    assert.equal(estaDentroDeDirectorio(hermanoMalicioso, base), false);
  });

  it('construye URLs por rol y actualiza puertos correctamente', () => {
    assert.equal(construirUrlRol('http://localhost:8000/', '/login'), 'http://localhost:8000/login');
    assert.equal(construirUrlRol('http://localhost:3000', 'admin.html'), 'http://localhost:3000/admin.html');
    assert.equal(actualizarUrlConPuerto('http://localhost:3000', 4050), 'http://localhost:4050');
  });

  it('nunca incluye rutas de rol externas en las URLs de prueba (SSRF por rutaAcceso)', () => {
    const urls = obtenerUrlsRutasProyecto({
      urlBase: 'http://localhost:3000',
      roles: [{ rutaAcceso: 'https://sitio-externo.example/' }, { rutaAcceso: '/login' }]
    });
    assert.deepEqual(urls, ['http://localhost:3000/login']);
  });

  it('parsea argumentos CLI tanto posicionales como con banderas (--proyecto, --max, --json)', () => {
    const flags = parsearArgumentosCLI(['--proyecto=bistrosoft-pos', '--max=150', '--json']);
    assert.equal(flags.filtro, 'bistrosoft-pos');
    assert.equal(flags.max, 150);
    assert.equal(flags.json, true);

    const posicionales = parsearArgumentosCLI(['titulacion', '100']);
    assert.equal(posicionales.filtro, 'titulacion');
    assert.equal(posicionales.max, 100);
    assert.equal(posicionales.json, false);
  });

  it('calcula puertos ocupados excluyendo el proyecto actual', () => {
    const muestra = [
      { id: 'a', puerto: 3000 },
      { id: 'b', puerto: 8000 },
      { id: 'c', puerto: 5000 }
    ];
    const set = obtenerPuertosOcupadosCatalogo(muestra, 'a');
    assert.equal(set.has(3000), false);
    assert.equal(set.has(8000), true);
    assert.equal(set.has(5000), true);
  });
});

describe('2. Validación de comandos y del catálogo', () => {
  it('acepta comandos de inicio legítimos', () => {
    for (const cmd of ['', 'iniciar.bat', 'qa-pruebas\\iniciar.bat', 'npm run dev', 'python run.py', 'php artisan serve --port=8000']) {
      assert.equal(validarComandoInicio(cmd).ok, true, cmd);
    }
  });

  it('rechaza comandos que permitirían ejecutar otra cosa', () => {
    for (const cmd of [
      'calc.exe',
      'npm run dev & calc',
      'npm run dev && del *',
      'python run.py | more',
      'cmd /c whoami',
      'powershell -c Get-Process',
      'npx paquete-cualquiera',
      '..\\..\\otro.bat',
      'C:\\Windows\\evil.bat',
      'iniciar.bat > salida.txt',
      'node -e "x"'
    ]) {
      assert.equal(validarComandoInicio(cmd).ok, false, cmd);
    }
  });

  it('valida rutas de acceso de los roles', () => {
    assert.equal(validarRutaAcceso('/login'), true);
    assert.equal(validarRutaAcceso('teacher.html'), true);
    assert.equal(validarRutaAcceso('http://localhost:3000/admin'), true);
    assert.equal(validarRutaAcceso('https://google.com'), false);
    assert.equal(validarRutaAcceso('javascript:alert(1)'), false);
    assert.equal(validarRutaAcceso('//evil.example'), false);
  });

  it('el catálogo incluido en el panel es válido', () => {
    const resultado = validarCatalogo(JSON.parse(contenidoRealInicial));
    assert.deepEqual(resultado.errores, []);
    assert.equal(resultado.ok, true);
  });

  it('rechaza catálogos con ids duplicados, puertos inválidos o URLs externas', () => {
    const base = { nombre: 'X', puerto: 3000, roles: [] };
    assert.equal(validarCatalogo({}).ok, false);
    assert.equal(validarCatalogo([{ ...base, id: 'a' }, { ...base, id: 'a' }]).ok, false);
    assert.equal(validarCatalogo([{ ...base, id: 'a', puerto: 70000 }]).ok, false);
    assert.equal(validarCatalogo([{ ...base, id: 'a', urlBase: 'https://evil.example' }]).ok, false);
    assert.equal(validarCatalogo([{ ...base, id: 'a', comandoInicio: 'calc & x' }]).ok, false);
    assert.equal(validarCatalogo([{ ...base, id: '../x' }]).ok, false);
    assert.equal(validarCatalogo([{ ...base, id: 'a' }]).ok, true);
  });
});

describe('3. Respaldos automáticos del catálogo', () => {
  it('crea un respaldo al guardar cambios y permite restaurarlo', () => {
    const original = leerProyectos();
    const modificado = original.map((p, i) => (i === 0 ? { ...p, notasSistema: 'cambio de prueba' } : p));

    const antes = listarRespaldos().length;
    guardarProyectos(modificado);
    const respaldos = listarRespaldos();
    assert.equal(respaldos.length, antes + 1);
    assert.equal(leerProyectos()[0].notasSistema, 'cambio de prueba');

    const r = restaurarRespaldo(respaldos[0].nombre);
    assert.equal(r.ok, true);
    assert.equal(leerProyectos()[0].notasSistema, original[0].notasSistema);
  });

  it('no crea respaldo si el contenido no cambió', () => {
    const antes = listarRespaldos().length;
    guardarProyectos(leerProyectos());
    assert.equal(listarRespaldos().length, antes);
  });

  it('rechaza nombres de respaldo que intenten salir de la carpeta', () => {
    assert.equal(restaurarRespaldo('../proyectos.json').ok, false);
    assert.equal(restaurarRespaldo('..\\..\\x.json').ok, false);
  });
});

describe('4. Estado de sistemas que comparten puerto', () => {
  const catalogo = [
    { id: 'a', puerto: 3000 },
    { id: 'b', puerto: 3000 },
    { id: 'c', puerto: 5000 },
    { id: 'd', puerto: 8000 }
  ];

  it('un puerto compartido activo sin dueño conocido queda "sin confirmar"', () => {
    duenosPuerto.clear();
    const e = calcularEstadosProyectos(catalogo, { 3000: true, 5000: true, 8000: false });
    assert.equal(e.a.estado, 'sin-confirmar');
    assert.equal(e.b.estado, 'sin-confirmar');
    assert.equal(e.c.estado, 'online');
    assert.equal(e.d.estado, 'apagado');
  });

  it('si el panel inició uno, ése queda en línea y el otro "ocupado"', () => {
    duenosPuerto.clear();
    duenosPuerto.set(3000, 'b');
    const e = calcularEstadosProyectos(catalogo, { 3000: true, 5000: false, 8000: false });
    assert.equal(e.b.estado, 'online');
    assert.equal(e.a.estado, 'ocupado');
    assert.equal(e.a.ocupadoPor, 'b');
    duenosPuerto.clear();
  });
});

describe('5. Catálogo de Proyectos, Ficha Técnica, Auditoría y Pruebas de Carga', () => {
  it('carga el catálogo de proyectos con estructura íntegra y métricas de ficha técnica', () => {
    const proyectos = leerProyectos();
    assert.ok(proyectos.length >= 1, 'El catálogo debe contener al menos 1 proyecto');

    for (const p of proyectos) {
      assert.ok(p.id, 'Cada proyecto debe tener id');
      assert.ok(p.nombre, 'Cada proyecto debe tener nombre');
      assert.ok(Array.isArray(p.roles), `${p.nombre} debe tener un arreglo de roles (vacío para arranque directo o con usuarios)`);
      if (p.fichaTecnica && p.fichaTecnica.metricas) {
        assert.equal(typeof p.fichaTecnica.metricas.totalArchivosCodigo, 'number');
        assert.equal(typeof p.fichaTecnica.metricas.lineasDeCodigo, 'number');
      }
    }
  });

  it('analiza la carpeta local y genera Ficha Técnica con métricas reales', (t) => {
    const proyectos = leerProyectos();
    const conCarpeta = proyectos.find((p) => resolverRutaProyectoSegura(p.carpetaLocal).ok);
    if (!conCarpeta) {
      t.skip('Ninguna carpeta de proyecto está disponible en este equipo');
      return;
    }
    const ficha = analizarCarpetaProyecto(conCarpeta.carpetaLocal);
    assert.ok(ficha, 'Debe retornar objeto de ficha técnica');
    assert.ok(ficha.metricas.totalArchivosCodigo > 0, 'Debe contabilizar archivos de código');
    assert.ok(ficha.metricas.lineasDeCodigo > 0, 'Debe contabilizar líneas de código');
  });

  it('ejecuta auditoría OWASP sobre un proyecto y devuelve calificación y hallazgos', async () => {
    const proyectos = leerProyectos();
    const filtrados = filtrarProyectosPorTermino(proyectos, proyectos[0].id);
    assert.ok(filtrados.length >= 1);

    const reporte = await auditarProyecto(filtrados[0]);
    assert.equal(reporte.id, filtrados[0].id);
    assert.equal(typeof reporte.score, 'number');
    assert.ok(['A', 'B', 'C', 'D'].includes(reporte.grado));
    assert.ok(Array.isArray(reporte.hallazgos) && reporte.hallazgos.length > 0);
  });

  it('bloquea pruebas de carga hacia servidores externos', async () => {
    await assert.rejects(
      () =>
        ejecutarPruebaCargaProyecto({
          id: 'externo',
          nombre: 'Externo',
          urlBase: 'https://google.com',
          puerto: 443,
          roles: []
        }),
      /localhost/i
    );
  });
});

describe('6. Endpoints HTTP y protecciones de server.js', () => {
  let baseUrl = '';
  let puerto = 0;

  before(async () => {
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        puerto = server.address().port;
        registrarPuertoPanel(puerto);
        baseUrl = `http://127.0.0.1:${puerto}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(() => resolve()));
  });

  const postJSON = (ruta, body, headers = {}) =>
    fetch(`${baseUrl}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });

  it('sirve index.html con cabeceras de seguridad y CSP, sin depender de CDNs', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('content-security-policy') || '', /script-src 'self'/);
    const html = await res.text();
    for (const js of ['js/utils.js', 'js/render.js', 'js/modals.js', 'js/app.js', 'css/tailwind.css']) {
      assert.ok(html.includes(js), js);
    }
    assert.ok(!html.includes('cdn.tailwindcss.com'), 'No debe cargar Tailwind desde CDN');
  });

  it('responde correctamente en GET /api/proyectos y GET /api/status (con estados por proyecto)', async () => {
    const resProy = await fetch(`${baseUrl}/api/proyectos`);
    assert.equal(resProy.status, 200);
    const dataProy = await resProy.json();
    assert.equal(dataProy.ok, true);
    assert.ok(Array.isArray(dataProy.proyectos));

    const resStatus = await fetch(`${baseUrl}/api/status`);
    const dataStatus = await resStatus.json();
    assert.equal(dataStatus.ok, true);
    assert.equal(typeof dataStatus.puertos, 'object');
    assert.equal(typeof dataStatus.estados, 'object');
    assert.ok(dataStatus.estados[dataProy.proyectos[0].id]);
  });

  it('GET /api/proyectos no escribe en disco', async () => {
    const antes = fs.statSync(DATA_FILE).mtimeMs;
    await fetch(`${baseUrl}/api/proyectos`);
    assert.equal(fs.statSync(DATA_FILE).mtimeMs, antes);
  });

  it('bloquea CSRF: POST sin application/json (formulario "simple" de otro sitio)', async () => {
    const res = await fetch(`${baseUrl}/api/proyectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ proyectos: [] })
    });
    assert.equal(res.status, 415);
  });

  it('bloquea peticiones con Origin de otro sitio', async () => {
    const res = await postJSON('/api/proyectos', { proyectos: [] }, { Origin: 'https://sitio-malicioso.example' });
    assert.equal(res.status, 403);
  });

  it('bloquea peticiones marcadas por el navegador como entre sitios', async () => {
    const res = await fetch(`${baseUrl}/api/proyectos`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(res.status, 403);
  });

  it('acepta el Origin propio del panel', async () => {
    const res = await fetch(`${baseUrl}/api/status`, { headers: { Origin: `http://localhost:${puerto}` } });
    assert.equal(res.status, 200);
  });

  it('bloquea DNS rebinding (Host distinto de localhost) en la API y en los archivos', async () => {
    const http = require('node:http');
    const pedir = (ruta) =>
      new Promise((resolve, reject) => {
        http
          .get({ host: '127.0.0.1', port: puerto, path: ruta, headers: { Host: `evil.example:${puerto}` } }, (res) => {
            res.resume();
            resolve(res.statusCode);
          })
          .on('error', reject);
      });
    assert.equal(await pedir('/api/proyectos'), 421);
    assert.equal(await pedir('/js/default-data.js'), 421);
  });

  it('rechaza catálogos con comandos peligrosos y no modifica el archivo', async () => {
    const antes = fs.readFileSync(DATA_FILE, 'utf8');
    const res = await postJSON('/api/proyectos', {
      proyectos: [{ id: 'x', nombre: 'x', puerto: 3001, carpetaLocal: 'public', comandoInicio: 'calc.exe & echo pwned', roles: [] }]
    });
    assert.equal(res.status, 422);
    assert.equal(fs.readFileSync(DATA_FILE, 'utf8'), antes);
  });

  it('guarda un catálogo válido y crea respaldo de la versión anterior', async () => {
    const { proyectos } = await (await fetch(`${baseUrl}/api/proyectos`)).json();
    const antes = listarRespaldos().length;
    proyectos[0].favorito = !proyectos[0].favorito;
    const res = await postJSON('/api/proyectos', { proyectos });
    assert.equal(res.status, 200);
    assert.equal(listarRespaldos().length, antes + 1);

    const lista = await (await fetch(`${baseUrl}/api/backups`)).json();
    assert.equal(lista.ok, true);
    assert.ok(lista.respaldos.length >= 1);
  });

  it('rechaza cuerpos de más de 2 MB', async () => {
    const res = await fetch(`${baseUrl}/api/proyectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '"' + 'a'.repeat(3 * 1024 * 1024) + '"'
    });
    assert.equal(res.status, 413);
  });

  it('rechaza intentos de abrir carpetas fuera del workspace en POST /api/open-folder', async () => {
    const res = await postJSON('/api/open-folder', { carpetaLocal: path.join('..', '..', '..', '..', 'Windows') });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.ok, false);
  });

  it('POST /api/login-as valida el rol y rechaza los que no tienen contraseña fija', async () => {
    const estado = await (await fetch(`${baseUrl}/api/login-as/estado`)).json();
    assert.equal(estado.ok, true);
    assert.equal(typeof estado.disponible, 'boolean');

    const { proyectos } = await (await fetch(`${baseUrl}/api/proyectos`)).json();
    const conRoles = proyectos.find((p) => (p.roles || []).length);
    const noExiste = await postJSON('/api/login-as', { id: conRoles.id, rolId: 'rol-que-no-existe' });
    assert.equal(noExiste.status, 404);

    const proyNota = proyectos.find((p) => (p.roles || []).some((r) => /sin contraseña|código de sala|autogenerado|cli/i.test(r.password)));
    if (proyNota) {
      const rolNota = proyNota.roles.find((r) => /sin contraseña|código de sala|autogenerado|cli/i.test(r.password));
      const res = await postJSON('/api/login-as', { id: proyNota.id, rolId: rolNota.id });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).codigo, 'NO_AUTOMATIZABLE');
    }
  });

  it('acepta sistemas sin roles (arranque directo)', async () => {
    const { proyectos } = await (await fetch(`${baseUrl}/api/proyectos`)).json();
    const copia = proyectos.map((p, i) => (i === 0 ? { ...p, roles: [] } : p));
    const res = await postJSON('/api/proyectos', { proyectos: copia });
    assert.equal(res.status, 200);
    await postJSON('/api/proyectos', { proyectos });
  });

  it('responde 404 en rutas de API inexistentes', async () => {
    const res = await fetch(`${baseUrl}/api/no-existe`);
    assert.equal(res.status, 404);
  });
});

describe('7. El catálogo real no se tocó', () => {
  it('data/proyectos.json sigue igual que al empezar', () => {
    assert.equal(fs.readFileSync(DATA_REAL, 'utf8'), contenidoRealInicial);
  });
});
