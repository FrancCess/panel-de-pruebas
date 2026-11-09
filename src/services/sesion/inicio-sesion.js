'use strict';

/**
 * Inicio de sesión automático por rol.
 *
 * Abre una ventana de Chrome (o Edge) controlada por el panel, entra a la página de login
 * del sistema, escribe el usuario y la contraseña del rol y envía el formulario, igual que
 * lo haría una persona. Así funciona con cualquier login (incluido el CSRF de Laravel).
 *
 * Cada rol usa su propia sesión aislada: se pueden tener varios roles del mismo sistema
 * abiertos al mismo tiempo sin que uno cierre la sesión del otro.
 */

const { construirUrlRol, esUrlLocalSegura } = require('../../utils/urls');

// Contraseñas del catálogo que en realidad son notas, no credenciales.
const CONTRASENAS_NO_AUTOMATIZABLES = [
  'sin contraseña',
  'sin contrasena',
  'pin de sala autogenerado',
  'código de sala',
  'codigo de sala',
  'configurado en cli'
];

const TIEMPO_CARGA_MS = 20000;
const TIEMPO_BUSCAR_FORMULARIO_MS = 7000;
const TIEMPO_RESULTADO_MS = 12000;

let playwright = null;
let navegador = null;
let lanzandoNavegador = null;
const sesiones = new Map(); // `${proyectoId}::${rolId}` -> { context, page }
const enCurso = new Map();

function cargarPlaywright() {
  if (playwright) return playwright;
  try {
    // eslint-disable-next-line global-require
    playwright = require('playwright-core');
    return playwright;
  } catch {
    return null;
  }
}

function inicioAutomaticoDisponible() {
  return Boolean(cargarPlaywright());
}

/**
 * Indica si un rol tiene credenciales que se puedan escribir automáticamente.
 */
function rolEsAutomatizable(rol) {
  if (!rol || rol.autoLogin === false) return false;
  const pass = String(rol.password || '').trim();
  if (!pass) return false;
  return !CONTRASENAS_NO_AUTOMATIZABLES.includes(pass.toLowerCase());
}

function crearError(codigo, mensaje) {
  return Object.assign(new Error(mensaje), { codigo });
}

/**
 * Abre (una sola vez) el navegador controlado. Usa el Chrome instalado; si no está, Edge.
 * PANEL_NAVEGADOR_RUTA permite indicar otro ejecutable (lo usan las pruebas).
 */
async function obtenerNavegador() {
  if (navegador && navegador.isConnected()) return navegador;
  if (lanzandoNavegador) return lanzandoNavegador;

  const pw = cargarPlaywright();
  if (!pw) {
    throw crearError(
      'SIN_PLAYWRIGHT',
      'Falta instalar el componente de inicio automático. En la carpeta del panel ejecuta: npm install'
    );
  }

  const opcionesBase = {
    headless: process.env.PANEL_NAVEGADOR_OCULTO === '1',
    args: ['--no-first-run', '--no-default-browser-check', '--disable-features=Translate']
  };

  const intentos = process.env.PANEL_NAVEGADOR_RUTA
    ? [{ ...opcionesBase, executablePath: process.env.PANEL_NAVEGADOR_RUTA }]
    : [
        { ...opcionesBase, channel: 'chrome' },
        { ...opcionesBase, channel: 'msedge' }
      ];

  lanzandoNavegador = (async () => {
    let ultimoError = null;
    for (const opciones of intentos) {
      try {
        const nav = await pw.chromium.launch(opciones);
        nav.on('disconnected', () => {
          if (navegador === nav) navegador = null;
          sesiones.clear();
        });
        navegador = nav;
        return nav;
      } catch (err) {
        ultimoError = err;
      }
    }
    throw crearError(
      'SIN_NAVEGADOR',
      `No se encontró Google Chrome ni Microsoft Edge para abrir la sesión (${ultimoError ? ultimoError.message.split('\n')[0] : 'sin detalle'}).`
    );
  })();

  try {
    return await lanzandoNavegador;
  } finally {
    lanzandoNavegador = null;
  }
}

/**
 * Marca dentro de la página el campo de usuario y el botón de envío del formulario
 * que contiene el campo de contraseña visible. Devuelve qué encontró.
 */
async function marcarFormulario(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };

    document.querySelectorAll('[data-panel-login]').forEach((el) => el.removeAttribute('data-panel-login'));

    const pass = [...document.querySelectorAll('input[type="password"]')].find(
      (el) => visible(el) && !el.disabled && !el.readOnly
    );
    if (!pass) return { password: false, usuario: false, enviar: false };
    pass.setAttribute('data-panel-login', 'password');

    const ambito = pass.form || pass.closest('form') || document;
    const tiposTexto = ['text', 'email', 'tel', ''];
    const candidatos = [...ambito.querySelectorAll('input')].filter(
      (el) =>
        el !== pass &&
        tiposTexto.includes((el.getAttribute('type') || '').toLowerCase()) &&
        visible(el) &&
        !el.disabled &&
        !el.readOnly
    );

    const puntaje = (el) => {
      const texto = `${el.name} ${el.id} ${el.autocomplete} ${el.placeholder} ${el.type}`.toLowerCase();
      let p = 0;
      if (el.autocomplete === 'username') p += 10;
      if (el.type === 'email') p += 6;
      if (/user|usuario|email|correo|login|cuenta|nombre/.test(texto)) p += 5;
      // Preferir el campo que está antes que la contraseña.
      if (el.compareDocumentPosition(pass) & Node.DOCUMENT_POSITION_FOLLOWING) p += 2;
      return p;
    };
    const usuario = candidatos.sort((a, b) => puntaje(b) - puntaje(a))[0];
    if (usuario) usuario.setAttribute('data-panel-login', 'usuario');

    const enviar = [
      ...ambito.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])')
    ].find((el) => visible(el) && !el.disabled);
    if (enviar) enviar.setAttribute('data-panel-login', 'enviar');

    return { password: true, usuario: Boolean(usuario), enviar: Boolean(enviar) };
  });
}

async function hayPasswordVisible(page) {
  try {
    return (await page.locator('input[type="password"]:visible').count()) > 0;
  } catch {
    return false;
  }
}

async function leerMensajeError(page) {
  try {
    return await page.evaluate(() => {
      const visible = (el) => {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };
      const sel =
        '[role="alert"], .error, .alert, .alert-danger, .callout.error, #error-message, #login-error, .invalid-feedback, .text-red-600, .text-red-700';
      const el = [...document.querySelectorAll(sel)].find((e) => visible(e) && e.textContent.trim());
      return el ? el.textContent.trim().replace(/\s+/g, ' ').slice(0, 200) : '';
    });
  } catch {
    return '';
  }
}

/**
 * Espera a que el login termine: cambia la URL o desaparece el campo de contraseña.
 */
async function esperarResultado(page, urlAntes) {
  const limite = Date.now() + TIEMPO_RESULTADO_MS;
  while (Date.now() < limite) {
    await page.waitForTimeout(300);
    if (page.isClosed()) return 'cerrada';
    const urlCambio = page.url() !== urlAntes;
    const conPassword = await hayPasswordVisible(page);
    if (!conPassword) return 'ok';
    if (urlCambio) {
      // Navegó pero sigue mostrando contraseña: puede ser otra pantalla de login (error) o carga.
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 3000 });
      } catch {
        // seguir esperando
      }
      if (!(await hayPasswordVisible(page))) return 'ok';
      return 'sigue-login';
    }
    // Mensaje de error sin navegar (logins hechos con fetch).
    if (await leerMensajeError(page)) return 'error';
  }
  return 'tiempo';
}

async function crearVentana(etiqueta) {
  const nav = await obtenerNavegador();
  const context = await nav.newContext({ viewport: null, locale: 'es-MX' });
  // Antepone el nombre del rol al título de la pestaña para distinguir las ventanas.
  await context.addInitScript((prefijo) => {
    const aplicar = () => {
      if (document.title && !document.title.startsWith(prefijo)) document.title = `${prefijo} ${document.title}`;
    };
    document.addEventListener('DOMContentLoaded', () => {
      aplicar();
      const t = document.querySelector('title');
      if (t) new MutationObserver(aplicar).observe(t, { childList: true });
    });
  }, `[${etiqueta}]`);
  const page = await context.newPage();
  return { context, page };
}

/**
 * Abre una ventana con la sesión del rol iniciada.
 * Devuelve { estado, mensaje, url } donde estado es:
 *  'sesion-iniciada' | 'ya-abierta' | 'sin-login' | 'fallo'
 */
async function iniciarSesionRol(proyecto, rol) {
  const clave = `${proyecto.id}::${rol.id}`;
  if (enCurso.has(clave)) return enCurso.get(clave);

  const tarea = (async () => {
    const existente = sesiones.get(clave);
    if (existente && !existente.page.isClosed()) {
      await existente.page.bringToFront();
      return { estado: 'ya-abierta', mensaje: `La ventana de ${rol.rol} ya estaba abierta.`, url: existente.page.url() };
    }
    sesiones.delete(clave);

    const url = construirUrlRol(proyecto.urlBase, rol.rutaAcceso);
    if (!esUrlLocalSegura(url)) throw crearError('URL_NO_LOCAL', 'Solo se puede iniciar sesión en sistemas de localhost.');

    const { context, page } = await crearVentana(rol.rol);
    sesiones.set(clave, { context, page });
    page.on('close', () => {
      if (sesiones.get(clave)?.page === page) sesiones.delete(clave);
      context.close().catch(() => {});
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIEMPO_CARGA_MS });
    } catch (err) {
      return { estado: 'fallo', mensaje: `No se pudo abrir ${url}: ${err.message.split('\n')[0]}`, url };
    }

    // Esperar a que aparezca el formulario (algunos sistemas lo dibujan con JavaScript).
    try {
      await page.locator('input[type="password"]:visible').first().waitFor({ timeout: TIEMPO_BUSCAR_FORMULARIO_MS });
    } catch {
      return {
        estado: 'sin-login',
        mensaje: 'La página abrió sin pedir contraseña (no tiene login o la sesión ya estaba iniciada).',
        url: page.url()
      };
    }

    const encontrado = await marcarFormulario(page);
    if (!encontrado.password) {
      return { estado: 'sin-login', mensaje: 'No se encontró un campo de contraseña.', url: page.url() };
    }

    if (encontrado.usuario && rol.usuario) {
      await page.locator('[data-panel-login="usuario"]').fill(String(rol.usuario));
    }
    await page.locator('[data-panel-login="password"]').fill(String(rol.password));

    const urlAntes = page.url();
    if (encontrado.enviar) {
      await page.locator('[data-panel-login="enviar"]').click();
    } else {
      await page.locator('[data-panel-login="password"]').press('Enter');
    }

    const resultado = await esperarResultado(page, urlAntes);
    if (resultado === 'ok') {
      // Si el sistema dejó al usuario en una página de login genérica, llevarlo a la ruta del rol.
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      } catch {
        // continuar
      }
      return { estado: 'sesion-iniciada', mensaje: `Sesión iniciada como ${rol.rol}.`, url: page.url() };
    }
    if (resultado === 'cerrada') {
      return { estado: 'fallo', mensaje: 'La ventana se cerró antes de terminar.', url };
    }

    const detalle = await leerMensajeError(page);
    return {
      estado: 'fallo',
      mensaje: detalle
        ? `El sistema respondió: "${detalle}". La ventana quedó abierta para que revises.`
        : 'El sistema no aceptó el inicio de sesión (o tardó demasiado). La ventana quedó abierta para que revises.',
      url: page.url()
    };
  })();

  enCurso.set(clave, tarea);
  try {
    return await tarea;
  } finally {
    enCurso.delete(clave);
  }
}

async function cerrarNavegador() {
  sesiones.clear();
  if (navegador) {
    const nav = navegador;
    navegador = null;
    await nav.close().catch(() => {});
  }
}

module.exports = {
  inicioAutomaticoDisponible,
  rolEsAutomatizable,
  iniciarSesionRol,
  cerrarNavegador,
  CONTRASENAS_NO_AUTOMATIZABLES
};
