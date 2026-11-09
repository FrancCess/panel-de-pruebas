'use strict';

/**
 * Pruebas del inicio de sesión automático por rol.
 *
 * Levanta sistemas simulados que imitan el login de cada proyecto real y verifica que el panel
 * escriba las credenciales y entre (o reporte el error del sistema). Usa el Chrome o Edge
 * instalado, en modo oculto. Si no hay navegador disponible, las pruebas de navegador se omiten.
 */

process.env.PANEL_NAVEGADOR_OCULTO = '1';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  inicioAutomaticoDisponible,
  rolEsAutomatizable,
  iniciarSesionRol,
  cerrarNavegador
} = require('../scripts/inicio-sesion');
const { iniciarSistemasSimulados } = require('./fixtures/logins-simulados');

describe('1. Qué roles se pueden automatizar', () => {
  it('acepta roles con contraseña real', () => {
    assert.equal(rolEsAutomatizable({ password: 'ClaveDemo-1' }), true);
    assert.equal(rolEsAutomatizable({ password: '9087' }), true);
  });

  it('rechaza contraseñas que en realidad son notas o roles desactivados', () => {
    for (const password of ['', 'Sin contraseña', 'PIN de sala autogenerado', 'Código de Sala', 'Configurado en CLI']) {
      assert.equal(rolEsAutomatizable({ password }), false, password);
    }
    assert.equal(rolEsAutomatizable({ password: 'ClaveDemo-1', autoLogin: false }), false);
  });
});

describe('2. Inicio de sesión en sistemas simulados', () => {
  let sim = null;
  let navegadorDisponible = true;

  const proyecto = (id, puerto) => ({ id, nombre: id, urlBase: `http://localhost:${puerto}`, puerto });
  const rol = (id, usuario, password, rutaAcceso) => ({ id, rol: id, usuario, password, rutaAcceso });

  before(async () => {
    sim = await iniciarSistemasSimulados();
    if (!inicioAutomaticoDisponible()) {
      navegadorDisponible = false;
      return;
    }
    // Verificar que haya un navegador que se pueda abrir.
    try {
      const r = await iniciarSesionRol(
        proyecto('verificacion', sim.puertos.impresiones),
        rol('verificacion', '', '9087', '/admin')
      );
      navegadorDisponible = Boolean(r);
    } catch (err) {
      if (['SIN_NAVEGADOR', 'SIN_PLAYWRIGHT'].includes(err.codigo)) navegadorDisponible = false;
      else throw err;
    }
  });

  after(async () => {
    await cerrarNavegador();
    if (sim) await sim.cerrar();
  });

  const casos = [
    ['Laravel con CSRF (Titulación)', 'titulacion', rol('t-admin', 'admin@ejemplo.test', 'ClaveDemo-1', '/login'), 'sesion-iniciada', /\/inicio$/],
    ['fetch + redirección por rol (BistroSoft)', 'bistro', rol('b-admin', 'admin', 'ClaveDemo-2', '/login.html'), 'sesion-iniciada', /\/admin\.html$/],
    ['ruta protegida que redirige al login (Horas)', 'horas', rol('h-tutor', 'tutor@ejemplo.test', 'ClaveDemo-4', '/tutor'), 'sesion-iniciada', /\/tutor$/],
    ['formulario dibujado con JavaScript (Parroquia)', 'parroquia', rol('p-parroco', 'usuario1', 'ClaveDemo-5', '/'), 'sesion-iniciada', null],
    ['solo PIN, sin usuario (SisImpresiones)', 'impresiones', rol('i-admin', 'admin', '9087', '/admin'), 'sesion-iniciada', /\/admin$/],
    ['contraseña incorrecta en Laravel', 'titulacion', rol('t-mal', 'admin@ejemplo.test', 'incorrecta', '/login'), 'fallo', null],
    ['contraseña incorrecta con fetch', 'bistro', rol('b-mal', 'admin', 'x', '/login.html'), 'fallo', null],
    ['contraseña incorrecta en SPA', 'parroquia', rol('p-mal', 'usuario1', 'x', '/'), 'fallo', null]
  ];

  for (const [titulo, sistema, datosRol, esperado, patronUrl] of casos) {
    it(`${titulo}: ${esperado}`, async (t) => {
      if (!navegadorDisponible) {
        t.skip('No hay Chrome/Edge o falta npm install');
        return;
      }
      const r = await iniciarSesionRol(proyecto(sistema, sim.puertos[sistema]), datosRol);
      assert.equal(r.estado, esperado, r.mensaje);
      if (patronUrl) assert.match(r.url, patronUrl);
      if (esperado === 'fallo') assert.match(r.mensaje, /incorrect|no coinciden/i);
    });
  }

  it('si la ventana del rol sigue abierta, la reutiliza en lugar de abrir otra', async (t) => {
    if (!navegadorDisponible) {
      t.skip('No hay Chrome/Edge o falta npm install');
      return;
    }
    const r = await iniciarSesionRol(
      proyecto('titulacion', sim.puertos.titulacion),
      rol('t-admin', 'admin@ejemplo.test', 'ClaveDemo-1', '/login')
    );
    assert.equal(r.estado, 'ya-abierta');
  });

  it('nunca abre sistemas que no sean de localhost', async (t) => {
    if (!navegadorDisponible) {
      t.skip('No hay Chrome/Edge o falta npm install');
      return;
    }
    await assert.rejects(
      () => iniciarSesionRol({ id: 'ext', urlBase: 'https://example.com' }, rol('x', 'a', 'b', '/')),
      /localhost/
    );
  });
});
