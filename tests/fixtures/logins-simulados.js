'use strict';
/**
 * Sistemas simulados que imitan el login de cada proyecto real (solo para pruebas):
 * Laravel con CSRF, BistroSoft con fetch, Horas con redirección, Parroquia (SPA) y SisImpresiones (solo PIN).
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { URLSearchParams } = require('node:url');

const leer = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => c.trim().split('=')));
const html = (res, body, status = 200, extra = {}) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...extra }); res.end(`<!doctype html><html><head><title>Sistema</title></head><body>${body}</body></html>`); };
const redir = (res, loc, extra = {}) => { res.writeHead(302, { Location: loc, ...extra }); res.end(); };

function iniciarSistemasSimulados() {
  const servidores = {};
  // 1. Laravel (Titulación): CSRF en sesión + email/password, redirección.
  const sesionesLaravel = new Map();
  const srv8100 = http.createServer(async (req, res) => {
    const c = cookies(req);
    let sid = c.laravel_session;
    if (!sid || !sesionesLaravel.has(sid)) { sid = crypto.randomUUID(); sesionesLaravel.set(sid, { token: crypto.randomUUID() }); }
    const ses = sesionesLaravel.get(sid);
    const ck = { 'Set-Cookie': `laravel_session=${sid}; HttpOnly; SameSite=Lax; Path=/` };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/login' && req.method === 'GET') {
      return html(res, `${ses.error ? `<div class="alerta" role="alert">${ses.error}</div>` : ''}
        <form method="post" action="/login"><input type="hidden" name="_token" value="${ses.token}">
        <div class="campo"><label for="email">Correo institucional</label><input id="email" name="email" type="email" autocomplete="username" required autofocus></div>
        <div class="campo"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
        <button class="boton login-submit">Iniciar sesión</button></form>`, 200, ck);
    }
    if (u.pathname === '/login' && req.method === 'POST') {
      const f = new URLSearchParams(await leer(req));
      if (f.get('_token') !== ses.token) return html(res, 'Page Expired', 419, ck);
      if (f.get('email') === 'admin@ejemplo.test' && f.get('password') === 'ClaveDemo-1') { ses.user = 'admin'; ses.error = null; return redir(res, '/inicio', ck); }
      ses.error = 'Estas credenciales no coinciden con nuestros registros.'; return redir(res, '/login', ck);
    }
    if (!ses.user) return redir(res, '/login', ck);
    return html(res, `<h1>Panel de ${ses.user}</h1>`, 200, ck);
  });
  servidores.titulacion = srv8100;

  // 2. BistroSoft: login.html con fetch JSON y redirección por rol desde JS.
  const tokensBistro = new Set();
  const srv8101 = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/login.html') return html(res, `<form id="login-form"><input type="text" id="username" name="username" required placeholder="Ingresa tu usuario">
      <input type="password" id="password" name="password" required placeholder="Ingresa tu contraseña"><button type="submit">Entrar</button></form>
      <p id="error-message" style="display:none">Usuario o contraseña incorrectos.</p>
      <script>document.getElementById('login-form').addEventListener('submit', async (e) => { e.preventDefault();
        const r = await fetch('/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: username.value, password: password.value }) });
        const d = await r.json(); if (r.ok) { location.href = d.role === 'admin' ? '/admin.html' : '/servidor.html'; } else { document.getElementById('error-message').style.display = 'block'; } });</script>`);
    if (u.pathname === '/login' && req.method === 'POST') {
      const d = JSON.parse(await leer(req));
      const ok = (d.username === 'admin' && d.password === 'ClaveDemo-2') || (d.username === 'cajero' && d.password === 'ClaveDemo-3');
      if (!ok) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"x"}'); }
      const t = crypto.randomUUID(); tokensBistro.add(t);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `token=${t}; Path=/` }); return res.end(JSON.stringify({ role: d.username === 'admin' ? 'admin' : 'cajero' }));
    }
    if (!tokensBistro.has(cookies(req).token)) return redir(res, '/login.html');
    return html(res, `<h1>${u.pathname}</h1>`);
  });
  servidores.bistro = srv8101;

  // 3. Horas Mecatrónica: /admin redirige a /login; form correo/password; redirección al panel del rol.
  const sesHoras = new Map();
  const srv8102 = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const s = sesHoras.get(cookies(req).sid);
    if (u.pathname === '/login' && req.method === 'GET') return html(res, `<p id="login-error" class="${u.searchParams.get('error') ? '' : 'hidden'}" style="${u.searchParams.get('error') ? '' : 'display:none'}">Correo o contraseña incorrectos.</p>
      <form action="/login" method="post" class="space-y-5"><input id="correo" name="correo" type="email"><input id="password" name="password" type="password"><button type="submit">Entrar</button></form>`);
    if (u.pathname === '/login' && req.method === 'POST') {
      const f = new URLSearchParams(await leer(req));
      if (f.get('correo') === 'tutor@ejemplo.test' && f.get('password') === 'ClaveDemo-4') { const sid = crypto.randomUUID(); sesHoras.set(sid, 'tutor'); return redir(res, '/tutor', { 'Set-Cookie': `sid=${sid}; Path=/` }); }
      return redir(res, '/login?error=1');
    }
    if (!s) return redir(res, '/login');
    return html(res, `<h1>Panel ${s}</h1>`);
  });
  servidores.horas = srv8102;

  // 4. Archivo Parroquial: SPA, el formulario se dibuja con JS después de cargar; la URL no cambia.
  const srv8103 = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/auth/login') {
      const d = JSON.parse(await leer(req));
      const ok = d.usuario === 'usuario1' && d.password === 'ClaveDemo-5';
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(ok ? { usuario: 'usuario1' } : { error: 'Usuario o contraseña incorrectos' }));
    }
    return html(res, `<div id="app">Cargando…</div><script>setTimeout(() => { app.innerHTML = '<form class="tarjeta" id="form-entrada" novalidate><div id="error-entrada"></div><div class="campo"><label for="usuario">Usuario</label><input id="usuario" name="usuario" type="text" autocomplete="username"></div><div class="campo"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password"></div><button class="btn primario bloque" type="submit">Entrar</button></form>';
      document.getElementById('form-entrada').addEventListener('submit', async (ev) => { ev.preventDefault();
        const r = await fetch('/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ usuario: usuario.value, password: password.value }) });
        if (r.ok) { app.innerHTML = '<h1>Bienvenido, párroco</h1>'; } else { document.getElementById('error-entrada').innerHTML = '<div class="callout error" role="alert">Usuario o contraseña incorrectos</div>'; } }); }, 700);</script>`);
  });
  servidores.parroquia = srv8103;

  // 5. SisImpresiones: /admin -> /admin/login con un solo campo PIN.
  const sesImp = new Set();
  const srv8104 = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/admin/login' && req.method === 'GET') return html(res, `<form method="post"><input type="password" name="pin" inputmode="numeric" placeholder="••••" autofocus required><button type="submit">Entrar</button></form>`);
    if (u.pathname === '/admin/login' && req.method === 'POST') {
      const f = new URLSearchParams(await leer(req));
      if (f.get('pin') === '9087') { const t = crypto.randomUUID(); sesImp.add(t); return redir(res, '/admin', { 'Set-Cookie': `s=${t}; Path=/` }); }
      return html(res, `<p class="error">PIN incorrecto.</p><form method="post"><input type="password" name="pin"><button type="submit">Entrar</button></form>`);
    }
    if (u.pathname === '/admin' && !sesImp.has(cookies(req).s)) return redir(res, '/admin/login');
    return html(res, `<h1>Panel del dueño</h1>`);
  });
  servidores.impresiones = srv8104;


  const nombres = Object.keys(servidores);
  return Promise.all(
    nombres.map((n) => new Promise((resolve) => servidores[n].listen(0, '127.0.0.1', resolve)))
  ).then(() => ({
    puertos: Object.fromEntries(nombres.map((n) => [n, servidores[n].address().port])),
    cerrar: () => Promise.all(nombres.map((n) => new Promise((r) => { servidores[n].closeAllConnections?.(); servidores[n].close(r); })))
  }));
}

module.exports = { iniciarSistemasSimulados };
