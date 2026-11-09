'use strict';

/**
 * Submódulo de Acciones de Sesión:
 * Inicio de sesión automático en Chrome/Edge (Playwright) y arranque asistido con pestaña de espera.
 */
(() => {
  const {
    rolEsAutomatizable,
    peticionJSON,
    escapeHtml,
    mostrarToast
  } = window.PanelPruebas.utils;

  function crearAccionesSesion(state, deps) {
    const { verificarEstadoPuertos, peticionIniciarProyecto } = deps;

    function abrirEnNavegadorNormal(proy, url, user, pass, rol) {
      const textoACopiar = pass && pass !== 'Sin contraseña' ? pass : user;
      if (textoACopiar) navigator.clipboard?.writeText(textoACopiar).catch(() => {});
      mostrarToast(
        user ? `Entrando como ${rol}` : `Abriendo ${proy ? proy.nombre : rol}`,
        user ? `Usuario: ${user} — Contraseña copiada (Ctrl+V)` : `Abriendo ${url}`,
        'info'
      );
      window.open(url, '_blank', 'noopener');
    }

    async function iniciarSesionAutomatica(proy, rolObj, url) {
      const clave = `${proy.id}::${rolObj.id}`;
      if (state.sesionesEnCurso.has(clave)) return;
      state.sesionesEnCurso.add(clave);

      const apagado = !state.puertosActivos[proy.puerto];
      mostrarToast(
        `Entrando como ${rolObj.rol}…`,
        apagado
          ? `Encendiendo ${proy.nombre} y abriendo una ventana con la sesión iniciada.`
          : 'Abriendo una ventana de Chrome con la sesión iniciada.',
        'info'
      );

      try {
        const data = await peticionJSON('/api/login-as', {
          method: 'POST',
          body: { id: proy.id, rolId: rolObj.id, autoIniciar: state.autoStartBat }
        });
        verificarEstadoPuertos();

        if (data.ok && data.estado === 'sesion-iniciada') {
          mostrarToast(`Sesión iniciada: ${rolObj.rol}`, `${proy.nombre} — revisa la ventana de Chrome.`, 'success');
        } else if (data.ok && data.estado === 'ya-abierta') {
          mostrarToast(`${rolObj.rol} ya tenía su ventana abierta`, 'Se trajo al frente.', 'info');
        } else if (data.ok && data.estado === 'sin-login') {
          mostrarToast(`${proy.nombre} abierto`, data.mensaje || '', 'info');
        } else if (['SIN_PLAYWRIGHT', 'SIN_NAVEGADOR'].includes(data.codigo)) {
          // Sin Chrome controlable: volver al método anterior (abrir y copiar la contraseña).
          state.inicioAutoDisponible = data.codigo !== 'SIN_PLAYWRIGHT' && state.inicioAutoDisponible;
          mostrarToast('No se pudo iniciar sesión automáticamente', data.error || '', 'error');
          abrirEnNavegadorNormal(proy, url, rolObj.usuario, rolObj.password, rolObj.rol);
        } else {
          mostrarToast(`No se pudo entrar como ${rolObj.rol}`, data.mensaje || data.error || '', 'error');
        }
      } finally {
        state.sesionesEnCurso.delete(clave);
      }
    }

    async function lanzarRolConAutoActivacion(projectId, url, user, pass, rol, rolId = '') {
      const proyAuto = state.proyectos.find((p) => p.id === projectId);
      const rolObj = proyAuto && rolId ? (proyAuto.roles || []).find((r) => r.id === rolId) : null;
      if (rolObj && state.autoLogin && state.serverDisponible && state.inicioAutoDisponible && rolEsAutomatizable(rolObj)) {
        await iniciarSesionAutomatica(proyAuto, rolObj, url);
        return;
      }

      const textoACopiar = pass && pass !== 'Sin contraseña' ? pass : user;
      if (textoACopiar) {
        navigator.clipboard?.writeText(textoACopiar).catch(() => {});
      }

      const proy = state.proyectos.find((p) => p.id === projectId);
      const estaOnline = proy ? Boolean(state.puertosActivos[proy.puerto]) : true;

      if (estaOnline || !state.autoStartBat || !state.serverDisponible || !proy) {
        mostrarToast(
          user ? `Entrando como ${rol}` : `Abriendo ${proy ? proy.nombre : rol}`,
          user ? `Usuario: ${user} — Contraseña copiada (Ctrl+V)` : `Abriendo ${url}`,
          'info'
        );
        window.open(url, '_blank', 'noopener');
        return;
      }

      const nuevaVentana = window.open('about:blank', '_blank');
      const scriptBat = proy.archivoBat || proy.comandoInicio || 'servidor';

      if (nuevaVentana && nuevaVentana.document) {
        nuevaVentana.document.write(`
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8" />
            <title>Iniciando ${escapeHtml(proy.nombre)}...</title>
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #f8fafc;
                color: #0f172a;
                font-family: system-ui, -apple-system, sans-serif;
              }
              .box {
                max-width: 440px;
                padding: 32px;
                border-radius: 20px;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                text-align: center;
                box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
              }
              .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid #e2e8f0;
                border-top-color: #4f46e5;
                border-radius: 50%;
                margin: 0 auto 18px;
                animation: spin 0.8s linear infinite;
              }
              @keyframes spin { to { transform: rotate(360deg); } }
              h2 { margin: 0 0 8px; font-size: 17px; color: #0f172a; }
              p { margin: 6px 0; font-size: 13px; color: #64748b; }
              .badge {
                display: inline-block;
                margin-top: 14px;
                padding: 6px 12px;
                border-radius: 10px;
                background: #eef2ff;
                color: #4338ca;
                font-family: monospace;
                font-size: 12px;
                font-weight: 600;
              }
            </style>
          </head>
          <body>
            <div class="box">
              <div class="spinner"></div>
              <h2>Iniciando ${escapeHtml(proy.nombre)}...</h2>
              <p>Ejecutando <strong>${escapeHtml(scriptBat)}</strong> y esperando al puerto <strong>:${escapeHtml(proy.puerto)}</strong></p>
              ${
                user
                  ? `<div class="badge">Rol: ${escapeHtml(rol)} — Contraseña ya copiada (Ctrl+V)</div>`
                  : `<div class="badge">Arranque directo en progreso...</div>`
              }
            </div>
          </body>
          </html>
        `);
      }

      mostrarToast(
        `Activando ${proy.nombre}`,
        `Se abrirá en cuanto el puerto :${proy.puerto} esté listo`,
        'info'
      );

      const arranque = await peticionIniciarProyecto(projectId, { esperar: true });
      if (!arranque.ok) {
        mostrarToast('No se pudo iniciar', arranque.error || '', 'error');
        if (nuevaVentana && !nuevaVentana.closed) {
          try {
            nuevaVentana.document.body.innerHTML = `<div style="font-family:system-ui,sans-serif;max-width:440px;margin:15vh auto;padding:28px;border:1px solid #fecdd3;border-radius:18px;text-align:center"><h2 style="font-size:17px">No se pudo iniciar ${escapeHtml(proy.nombre)}</h2><p style="color:#64748b;font-size:13px">${escapeHtml(arranque.error || 'Error desconocido.')}</p><p style="color:#64748b;font-size:13px">Puedes cerrar esta pestaña.</p></div>`;
          } catch {
            // La pestaña ya no es accesible
          }
        }
        return;
      }

      if (nuevaVentana) {
        nuevaVentana.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener');
      }
    }

    return {
      abrirEnNavegadorNormal,
      iniciarSesionAutomatica,
      lanzarRolConAutoActivacion
    };
  }

  window.PanelPruebas = window.PanelPruebas || {};
  window.PanelPruebas.accionesSesion = { crearAccionesSesion };
})();
