'use strict';

/**
 * Controlador principal del panel:
 * - Inicio: una estampa por sistema.
 * - Al tocar un sistema se abre su panel (#/sistema/<id>) con usuarios, controles,
 *   conexión, pruebas y ficha técnica. El botón "atrás" del navegador regresa al inicio.
 */
(() => {
  const {
    STORAGE_KEY,
    rolEsAutomatizable,
    peticionJSON,
    escapeHtml,
    actualizarUrlLocalConPuerto,
    mostrarToast,
    copiarAlPortapapeles,
    descargarArchivoJSON,
    aArregloFicha,
    formatearListaFicha,
    obtenerMetricasNormalizadas,
    modalAbiertoSuperior,
    cerrarModal,
    atraparFoco
  } = window.PanelPruebas.utils;

  const { renderizarPanelIconos, renderizarVistaSistema } = window.PanelPruebas.render;

  const {
    crearFilaFormularioRol,
    abrirModalProyecto,
    cerrarModalProyecto,
    guardarFormularioProyecto,
    eliminarProyectoActual,
    ejecutarAuditoriaSeguridad,
    cerrarModalAuditoria,
    exportarReporteAuditoria,
    abrirModalPruebaCarga,
    correrPruebaCargaActual,
    cerrarModalPruebaCarga,
    abrirModalRespaldos,
    cerrarModalRespaldos
  } = window.PanelPruebas.modals;

  const PREFS_KEY = 'panel_pruebas_preferencias_v1';

  const state = {
    proyectos: [],
    sistemaAbiertoId: null,
    sistemaSeleccionadoId: null, // lo usan los modales al guardar
    puertosActivos: {},
    estados: {},
    serverDisponible: false,
    autoStartBat: true,
    autoLogin: true, // Entrar con la sesión ya iniciada en una ventana de Chrome
    inicioAutoDisponible: false,
    sesionesEnCurso: new Set(),
    ocupados: new Set(),
    mostrarTodasClaves: false,
    clavesVisiblesIndividuales: new Set()
  };

  function guardarEnLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.proyectos));
    } catch {
      // Almacenamiento no disponible
    }
  }

  function leerPreferencias() {
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (typeof prefs.autoStartBat === 'boolean') state.autoStartBat = prefs.autoStartBat;
      if (typeof prefs.autoLogin === 'boolean') state.autoLogin = prefs.autoLogin;
    } catch {
      // Sin preferencias guardadas
    }
  }

  function guardarPreferencias() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ autoStartBat: state.autoStartBat, autoLogin: state.autoLogin }));
    } catch {
      // Almacenamiento no disponible
    }
  }

  function pintarInterruptor(idEtiqueta, encendido) {
    const lbl = document.getElementById(idEtiqueta);
    if (!lbl) return;
    lbl.textContent = encendido ? 'ON' : 'OFF';
    lbl.className = encendido
      ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700'
      : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600';
  }

  async function consultarInicioAutomatico() {
    if (!state.serverDisponible) return;
    const data = await peticionJSON('/api/login-as/estado');
    state.inicioAutoDisponible = Boolean(data.ok && data.disponible);
  }

  // --- CARGA Y PERSISTENCIA ---
  async function cargarDatosIniciales() {
    let cargadoDesdeServidor = false;
    try {
      const res = await fetch('/api/proyectos', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.proyectos) && data.proyectos.length > 0) {
          state.proyectos = data.proyectos;
          state.serverDisponible = true;
          cargadoDesdeServidor = true;
          guardarEnLocalStorage();
        }
      }
    } catch {
      state.serverDisponible = false;
    }

    if (cargadoDesdeServidor) {
      actualizarBadgeServidor(true);
      asegurarSistemaSeleccionado();
      renderizarTodo();
      await Promise.all([verificarEstadoPuertos(), consultarInicioAutomatico()]);
      return;
    }

    actualizarBadgeServidor(false);
    const respaldoDefault = window.PROYECTOS_DEFAULT || window.DEFAULT_HUB_DATA || [];
    const guardadoLocal = localStorage.getItem(STORAGE_KEY);
    if (guardadoLocal) {
      try {
        state.proyectos = JSON.parse(guardadoLocal);
      } catch {
        state.proyectos = structuredClone(respaldoDefault);
      }
    } else {
      state.proyectos = structuredClone(respaldoDefault);
      guardarEnLocalStorage();
    }

    asegurarSistemaSeleccionado();
    renderizarTodo();
  }

  function asegurarSistemaSeleccionado(listaFiltrada = state.proyectos) {
    if (!listaFiltrada.length) {
      state.sistemaSeleccionadoId = null;
      return;
    }
    const existe = listaFiltrada.some((p) => p.id === state.sistemaSeleccionadoId);
    if (!existe) {
      state.sistemaSeleccionadoId = listaFiltrada[0].id;
    }
  }

  /**
   * Guarda el catálogo. El servidor valida los datos: si los rechaza se muestra el motivo
   * y se devuelve false (el formulario queda abierto para corregir).
   */
  async function guardarProyectosEnAlmacenamiento() {
    if (!state.serverDisponible) {
      guardarEnLocalStorage();
      return true;
    }
    const data = await peticionJSON('/api/proyectos', { method: 'POST', body: { proyectos: state.proyectos } });
    if (data.ok || data.sinConexion) {
      guardarEnLocalStorage();
      if (data.sinConexion) {
        mostrarToast('Sin conexión con el panel', 'Los cambios se guardaron solo en este navegador.', 'error');
      }
      return true;
    }
    mostrarToast('No se guardaron los cambios', data.error || 'El servidor rechazó los datos.', 'error');
    return false;
  }

  async function recargarDesdeServidor() {
    if (!state.serverDisponible) {
      renderizarTodo();
      return;
    }
    const data = await peticionJSON('/api/proyectos');
    if (data.ok && Array.isArray(data.proyectos)) {
      state.proyectos = data.proyectos;
      guardarEnLocalStorage();
      asegurarSistemaSeleccionado();
    }
    renderizarTodo();
  }

  function actualizarBadgeServidor(online) {
    const badge = document.getElementById('serverModeBadge');
    if (!badge) return;
    if (online) {
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200';
      badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Conectado`;
    } else {
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200';
      badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Modo Local`;
    }
  }

  async function verificarEstadoPuertos(mostrarNotificacion = false) {
    if (!state.serverDisponible) return;

    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        state.puertosActivos = data.puertos || {};
        state.estados = data.estados || {};
        renderizarTodo();
        if (mostrarNotificacion) {
          const activos = Object.values(state.puertosActivos).filter(Boolean).length;
          mostrarToast('Puertos actualizados', `${activos} puerto(s) activos en este momento`, 'success');
        }
      }
    } catch {
      // Ignorar fallos momentáneos
    }
  }

  // --- NAVEGACIÓN: INICIO <-> PANEL DE UN SISTEMA ---
  function idDesdeHash() {
    const m = /^#\/sistema\/(.+)$/.exec(window.location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function abrirSistema(projectId) {
    if (projectId === '__nuevo__') {
      abrirModalProyecto(null, state);
      return;
    }
    window.location.hash = `#/sistema/${encodeURIComponent(projectId)}`;
  }

  function volverAlInicio() {
    if (idDesdeHash()) {
      if (window.history.length > 1 && state.llegoDesdeInicio) window.history.back();
      else window.location.hash = '';
    }
  }

  function aplicarRuta() {
    const id = idDesdeHash();
    const existe = id && state.proyectos.some((p) => p.id === id);
    const anterior = state.sistemaAbiertoId;
    state.sistemaAbiertoId = existe ? id : null;
    state.sistemaSeleccionadoId = state.sistemaAbiertoId;
    if (!existe && id && state.proyectos.length) window.location.hash = '';

    renderizarTodo();
    if (state.sistemaAbiertoId !== anterior) {
      window.scrollTo({ top: 0 });
      const destino = state.sistemaAbiertoId
        ? document.getElementById('tituloSistema')
        : document.querySelector(`[data-launcher-id="${CSS.escape(anterior || '')}"]`);
      if (destino) destino.focus({ preventScroll: true });
    }
  }

  // --- RENDERIZADO ---
  function renderizarTodo() {
    const inicio = document.getElementById('launcherViewSection');
    const vista = document.getElementById('vistaSistema');
    const proy = state.proyectos.find((p) => p.id === state.sistemaAbiertoId);

    if (proy) {
      inicio.classList.add('hidden');
      vista.classList.remove('hidden');
      // Conservar lo que se esté escribiendo en el campo de puerto.
      const activo = document.activeElement;
      const editandoPuerto = activo && activo.hasAttribute && activo.hasAttribute('data-quick-port-id');
      const valorPuerto = editandoPuerto ? activo.value : null;
      renderizarVistaSistema(proy, state);
      document.title = `${proy.nombre} · Mis Sistemas`;
      if (editandoPuerto) {
        const input = vista.querySelector('[data-quick-port-id]');
        if (input) {
          input.value = valorPuerto;
          input.focus();
        }
      }
    } else {
      vista.classList.add('hidden');
      inicio.classList.remove('hidden');
      document.title = 'Mis Sistemas';
    }
    const ordenados = [...state.proyectos].sort((a, b) => Number(Boolean(b.favorito)) - Number(Boolean(a.favorito)));
    renderizarPanelIconos(ordenados, state, (id) => {
      state.llegoDesdeInicio = true;
      abrirSistema(id);
    });
  }

  // --- PETICIONES UNIFICADAS DE ARRANQUE DE PROYECTO ---
  async function peticionIniciarProyecto(projectId, opciones = {}) {
    const proy = state.proyectos.find((p) => p.id === projectId);
    if (!proy) return { ok: false, error: 'Proyecto no encontrado' };

    try {
      const res = await fetch('/api/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          esperar: opciones.esperar !== false,
          autoPuertoLibre: Boolean(opciones.autoPuertoLibre),
          forzar: Boolean(opciones.reiniciar)
        })
      });
      const data = await res.json();
      if (data.ok) {
        if (data.puerto) proy.puerto = data.puerto;
        if (data.urlBase) proy.urlBase = data.urlBase;
        if (data.online) {
          state.puertosActivos[proy.puerto] = true;
        }
        guardarEnLocalStorage();
        renderizarTodo();
      }
      return data;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function activarSistemaConBat(projectId, autoPuertoLibre = false, reiniciar = false) {
    const proy = state.proyectos.find((p) => p.id === projectId);
    if (!proy) return;

    if (!state.serverDisponible) {
      mostrarToast('Servidor requerido', 'Abre iniciar-panel.bat para lanzar scripts .bat.', 'error');
      return;
    }

    const scriptNombre = proy.archivoBat || proy.comandoInicio || 'servidor';
    mostrarToast(
      reiniciar ? `Reiniciando ${proy.nombre}…` : `Iniciando ${proy.nombre}…`,
      autoPuertoLibre
        ? `Buscando puerto libre y ejecutando ${scriptNombre}`
        : `Ejecutando ${scriptNombre} en :${proy.puerto}`,
      'info'
    );

    state.ocupados.add(projectId);
    renderizarTodo();
    const data = await peticionIniciarProyecto(projectId, { esperar: true, autoPuertoLibre, reiniciar });
    state.ocupados.delete(projectId);
    await verificarEstadoPuertos();
    if (data.ok) {
      mostrarToast(
        data.yaEstabaActivo
          ? `${proy.nombre} ya estaba en línea (:${proy.puerto})`
          : `${proy.nombre} iniciado en :${proy.puerto}`,
        data.mensaje || `Ejecutado: ${data.ejecutado}`,
        'success'
      );
    } else {
      mostrarToast('No se pudo iniciar', data.error || '', 'error');
    }
  }

  async function detenerSistemaConBat(projectId) {
    const proy = state.proyectos.find((p) => p.id === projectId);
    if (!proy) return;

    state.ocupados.add(projectId);
    renderizarTodo();
    try {
      const res = await fetch('/api/stop-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId })
      });
      const data = await res.json();
      if (data.ok) {
        state.puertosActivos[proy.puerto] = Boolean(data.online);
        mostrarToast(`${proy.nombre} detenido`, `Se ejecutó ${data.ejecutado}`, 'info');
      } else {
        mostrarToast('No se pudo detener', data.error || '', 'error');
      }
    } catch (err) {
      mostrarToast('Error', err.message, 'error');
    } finally {
      state.ocupados.delete(projectId);
      await verificarEstadoPuertos();
      renderizarTodo();
    }
  }

  async function escanearBatsEnProyectos() {
    if (!state.serverDisponible) {
      mostrarToast('Modo sin servidor', 'Ejecuta iniciar-panel.bat para buscar archivos .bat.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/scan-bats', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && Array.isArray(data.proyectos)) {
        state.proyectos = data.proyectos;
        guardarEnLocalStorage();
        renderizarTodo();
        mostrarToast(
          'Archivos .bat actualizados',
          `Se vincularon ${data.detectados} scripts de inicio en tus proyectos.`,
          'success'
        );
      }
    } catch (err) {
      mostrarToast('Error al buscar .bat', err.message, 'error');
    }
  }

  async function cambiarPuertoDeProyecto(projectId, nuevoPuerto, autoLibre = false) {
    const proy = state.proyectos.find((p) => p.id === projectId);
    if (!proy) return;

    if (!autoLibre) {
      if (!Number.isInteger(nuevoPuerto) || nuevoPuerto < 1 || nuevoPuerto > 65535) {
        mostrarToast('Puerto inválido', 'Ingresa un número de puerto entre 1 y 65535.', 'error');
        return;
      }
    }

    if (state.serverDisponible) {
      try {
        const res = await fetch('/api/change-port', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: projectId,
            nuevoPuerto: autoLibre ? undefined : nuevoPuerto,
            auto: autoLibre
          })
        });
        const data = await res.json();
        if (data.ok) {
          proy.puerto = data.nuevoPuerto;
          proy.urlBase = data.urlBase;
          state.puertosActivos[data.nuevoPuerto] = Boolean(data.ocupadoActualmente);
          guardarEnLocalStorage();
          renderizarTodo();
          mostrarToast(
            `Puerto ajustado a :${data.nuevoPuerto}`,
            `${proy.nombre} ahora apunta a ${data.urlBase}`,
            'success'
          );
          return;
        } else {
          mostrarToast('No se pudo cambiar el puerto', data.error || '', 'error');
          return;
        }
      } catch {
        // Respaldo local si falla red
      }
    }

    let puertoFinal = nuevoPuerto;
    if (autoLibre) {
      const usados = new Set(
        state.proyectos
          .filter((item) => item.id !== projectId)
          .map((item) => Number(item.puerto))
      );
      let candidato = (Number(proy.puerto) || 3000) + 1;
      while (usados.has(candidato) || candidato === 4500) {
        candidato++;
      }
      puertoFinal = candidato;
    }

    proy.puerto = puertoFinal;
    proy.urlBase = actualizarUrlLocalConPuerto(proy.urlBase, puertoFinal);
    await guardarProyectosEnAlmacenamiento();
    renderizarTodo();
    mostrarToast(
      `Puerto ajustado a :${puertoFinal}`,
      `${proy.nombre} ahora apunta a ${proy.urlBase}`,
      'success'
    );
  }

  function copiarFichaTecnicaMarkdown(projectId) {
    const p = state.proyectos.find((item) => item.id === projectId);
    if (!p || !p.fichaTecnica) return;
    const ft = p.fichaTecnica;
    const { totalArchivos, totalLineas } = obtenerMetricasNormalizadas(ft.metricas);
    const tablas = aArregloFicha(ft.tablasBaseDatos);

    const lineas = [
      `# Ficha Técnica: ${p.nombre}`,
      `- **Categoría:** ${p.categoria || 'General'}`,
      `- **Arquitectura:** ${ft.tipoArquitectura || 'Aplicación Web'}`,
      `- **Versión:** ${ft.version || '1.0.0'}`,
      `- **URL Local:** ${p.urlBase} (Puerto ${p.puerto})`,
      `- **Motor / Runtime:** ${formatearListaFicha(ft.motorRuntime, ', ', 'N/A')}`,
      `- **Lenguajes:** ${formatearListaFicha(ft.lenguajes, ', ', 'N/A')}`,
      `- **Backend:** ${formatearListaFicha(ft.backend, ', ', 'N/A')}`,
      `- **Frontend:** ${formatearListaFicha(ft.frontend, ', ', 'N/A')}`,
      `- **Base de Datos:** ${formatearListaFicha(ft.baseDatos, ', ', 'N/A')}`,
      `- **Librerías Clave:** ${formatearListaFicha(ft.libreriasClave, ', ', 'N/A')}`,
      `- **Seguridad:** ${formatearListaFicha(ft.seguridad, ', ', 'N/A')}`,
      `- **Métricas de Código:** ${totalArchivos} archivos (~${totalLineas.toLocaleString()} líneas de código)`,
      tablas.length > 0
        ? `- **Tablas Detectadas (${tablas.length}):** ${tablas.join(', ')}`
        : ''
    ].filter(Boolean);

    copiarAlPortapapeles(lineas.join('\n'), `Ficha Técnica de ${p.nombre}`);
  }

  /**
   * Abre una ventana de Chrome con la sesión del rol ya iniciada (el servidor enciende
   * el sistema si hace falta, escribe usuario y contraseña y envía el formulario).
   */
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

  async function abrirCarpetaEnExplorador(carpetaLocal) {
    try {
      const res = await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carpetaLocal })
      });
      const data = await res.json();
      if (data.ok) {
        mostrarToast('Carpeta abierta', data.ruta, 'success');
      } else {
        mostrarToast('No se pudo abrir la carpeta', data.error || '', 'error');
      }
    } catch {
      mostrarToast('Servidor requerido', 'Inicia el servidor local para abrir carpetas.', 'error');
    }
  }

  // --- EXPORTAR / IMPORTAR / RESTAURAR ---
  function exportarCatalogoJSON() {
    descargarArchivoJSON(state.proyectos, 'proyectos-pruebas');
  }

  function importarCatalogoJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) throw new Error('Formato inválido');
        state.proyectos = parsed;
        asegurarSistemaSeleccionado();
        await guardarProyectosEnAlmacenamiento();
        renderizarTodo();
        verificarEstadoPuertos();
        mostrarToast('Catálogo importado', `${parsed.length} sistemas cargados`, 'success');
      } catch {
        mostrarToast('Error', 'Archivo JSON inválido.', 'error');
      }
    };
    reader.readAsText(file);
  }

  async function restaurarCatalogoPorDefecto() {
    if (!confirm('¿Restaurar el catálogo original de sistemas y roles?')) return;
    state.proyectos = structuredClone(window.PROYECTOS_DEFAULT || window.DEFAULT_HUB_DATA || []);
    asegurarSistemaSeleccionado();
    await guardarProyectosEnAlmacenamiento();
    renderizarTodo();
    verificarEstadoPuertos();
    mostrarToast('Catálogo restaurado', 'Se cargaron los sistemas originales', 'success');
  }

  // --- ACCIONES DEL PANEL DE UN SISTEMA ---
  function manejarClickAcciones(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;

    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');

    switch (action) {
      case 'volver':
        volverAlInicio();
        break;
      case 'copy-user':
        copiarAlPortapapeles(btn.getAttribute('data-value') || '', 'Usuario');
        break;
      case 'copy-pass':
        copiarAlPortapapeles(btn.getAttribute('data-value') || '', 'Contraseña');
        break;
      case 'copy-pin':
        copiarAlPortapapeles(btn.getAttribute('data-pin') || '', 'PIN');
        break;
      case 'toggle-pass': {
        const key = btn.getAttribute('data-role-key');
        if (state.clavesVisiblesIndividuales.has(key)) state.clavesVisiblesIndividuales.delete(key);
        else state.clavesVisiblesIndividuales.add(key);
        renderizarTodo();
        break;
      }
      case 'launch-role':
        lanzarRolConAutoActivacion(
          btn.getAttribute('data-project-id'),
          btn.getAttribute('data-url'),
          btn.getAttribute('data-user') || '',
          btn.getAttribute('data-pass') || '',
          btn.getAttribute('data-rol') || 'Rol',
          btn.getAttribute('data-role-id') || ''
        );
        break;
      case 'start-project':
        activarSistemaConBat(id);
        break;
      case 'restart-project':
        activarSistemaConBat(id, false, true);
        break;
      case 'stop-project':
        detenerSistemaConBat(id);
        break;
      case 'toggle-fav': {
        const proy = state.proyectos.find((p) => p.id === id);
        if (proy) {
          proy.favorito = !proy.favorito;
          renderizarTodo();
          guardarProyectosEnAlmacenamiento();
        }
        break;
      }
      case 'edit-project':
        abrirModalProyecto(id, state);
        break;
      case 'audit-project':
        ejecutarAuditoriaSeguridad(id);
        break;
      case 'load-test-project':
        abrirModalPruebaCarga(id, state);
        break;
      case 'copy-ficha':
        copiarFichaTecnicaMarkdown(id);
        break;
      case 'apply-quick-port': {
        const input = document.querySelector(`[data-quick-port-id="${CSS.escape(id)}"]`);
        if (input) cambiarPuertoDeProyecto(id, Number(input.value), false);
        break;
      }
      case 'auto-free-port':
        cambiarPuertoDeProyecto(id, null, true);
        break;
      case 'start-free-port':
        activarSistemaConBat(id, true);
        break;
      case 'open-folder':
        abrirCarpetaEnExplorador(btn.getAttribute('data-folder'));
        break;
      default:
        break;
    }
  }

  // --- EVENTOS ---
  function inicializarEventosUI() {
    const callbacksModales = {
      guardarProyectosEnAlmacenamiento,
      asegurarSistemaSeleccionado,
      renderizarTodo,
      recargarDesdeServidor,
      verificarEstadoPuertos,
      peticionIniciarProyecto,
      activarSistemaConBat
    };

    const vista = document.getElementById('vistaSistema');
    vista.addEventListener('click', manejarClickAcciones);
    vista.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.hasAttribute('data-quick-port-id')) {
        e.preventDefault();
        cambiarPuertoDeProyecto(e.target.getAttribute('data-quick-port-id'), Number(e.target.value), false);
      }
    });

    window.addEventListener('hashchange', aplicarRuta);

    // Formulario: puerto y URL se mantienen sincronizados
    document.getElementById('formUrlBase').addEventListener('input', (e) => {
      try {
        const u = new URL(e.target.value);
        if (u.port) document.getElementById('formPuerto').value = u.port;
      } catch {
        // Ignorar mientras se escribe
      }
    });
    document.getElementById('formPuerto').addEventListener('input', (e) => {
      const p = Number(e.target.value);
      if (Number.isInteger(p) && p > 0 && p <= 65535) {
        const urlInput = document.getElementById('formUrlBase');
        urlInput.value = actualizarUrlLocalConPuerto(urlInput.value, p);
      }
    });

    // Menú de opciones
    pintarInterruptor('labelAutoStart', state.autoStartBat);
    pintarInterruptor('labelAutoLogin', state.autoLogin);

    document.getElementById('btnToggleAutoLogin').addEventListener('click', (e) => {
      e.stopPropagation();
      state.autoLogin = !state.autoLogin;
      guardarPreferencias();
      pintarInterruptor('labelAutoLogin', state.autoLogin);
    });
    document.getElementById('btnToggleAutoStart').addEventListener('click', (e) => {
      e.stopPropagation();
      state.autoStartBat = !state.autoStartBat;
      guardarPreferencias();
      pintarInterruptor('labelAutoStart', state.autoStartBat);
    });
    document.getElementById('btnToggleAllPasswords').addEventListener('click', (e) => {
      e.stopPropagation();
      state.mostrarTodasClaves = !state.mostrarTodasClaves;
      if (!state.mostrarTodasClaves) state.clavesVisiblesIndividuales.clear();
      pintarInterruptor('labelTogglePasswords', state.mostrarTodasClaves);
      renderizarTodo();
    });

    const btnConfigMenu = document.getElementById('btnConfigMenu');
    const configDropdown = document.getElementById('configDropdown');
    btnConfigMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = configDropdown.classList.contains('hidden');
      configDropdown.classList.toggle('hidden', !abrir);
      btnConfigMenu.setAttribute('aria-expanded', String(abrir));
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#dropdownConfigWrapper')) {
        configDropdown.classList.add('hidden');
        btnConfigMenu.setAttribute('aria-expanded', 'false');
      }
    });
    configDropdown.addEventListener('click', (e) => {
      if (e.target.closest('[data-cierra-menu]')) {
        configDropdown.classList.add('hidden');
        btnConfigMenu.setAttribute('aria-expanded', 'false');
      }
    });

    document.getElementById('btnScanBats').addEventListener('click', escanearBatsEnProyectos);
    document.getElementById('btnCheckStatus').addEventListener('click', () => verificarEstadoPuertos(true));
    document.getElementById('btnAuditAll').addEventListener('click', () => ejecutarAuditoriaSeguridad(null));
    document.getElementById('btnExportJSON').addEventListener('click', exportarCatalogoJSON);
    document.getElementById('inputImportJSON').addEventListener('change', (e) => {
      importarCatalogoJSON(e.target.files[0]);
      e.target.value = '';
    });
    document.getElementById('btnResetDefaults').addEventListener('click', () => {
      if (!state.serverDisponible) {
        restaurarCatalogoPorDefecto();
        return;
      }
      abrirModalRespaldos({
        onRestaurado: async (proyectos) => {
          state.proyectos = proyectos;
          guardarEnLocalStorage();
          aplicarRuta();
          await verificarEstadoPuertos();
        }
      });
    });

    // Modales
    document.getElementById('btnCloseAuditModal').addEventListener('click', cerrarModalAuditoria);
    document.getElementById('btnDoneAuditModal').addEventListener('click', cerrarModalAuditoria);
    document.getElementById('btnExportAuditReport').addEventListener('click', exportarReporteAuditoria);
    document.getElementById('btnStartLoadTest').addEventListener('click', () => correrPruebaCargaActual(state, callbacksModales));
    document.getElementById('btnCloseLoadTestModal').addEventListener('click', cerrarModalPruebaCarga);
    document.getElementById('btnDoneLoadTestModal').addEventListener('click', cerrarModalPruebaCarga);
    document.getElementById('btnCloseBackupsModal').addEventListener('click', cerrarModalRespaldos);
    document.getElementById('btnDoneBackupsModal').addEventListener('click', cerrarModalRespaldos);
    document.getElementById('btnCloseModal').addEventListener('click', cerrarModalProyecto);
    document.getElementById('btnCancelModal').addEventListener('click', cerrarModalProyecto);
    document.getElementById('btnSaveProject').addEventListener('click', async () => {
      await guardarFormularioProyecto(state, callbacksModales);
      aplicarRuta();
    });
    document.getElementById('btnDeleteProject').addEventListener('click', async () => {
      await eliminarProyectoActual(state, callbacksModales);
      aplicarRuta();
    });
    document.getElementById('btnDetectarCarpeta').addEventListener('click', () => window.PanelPruebas.modals.detectarDesdeCarpeta());
    document.getElementById('btnAddRoleRow').addEventListener('click', () => {
      const container = document.getElementById('rolesFormContainer');
      const fila = crearFilaFormularioRol({ rutaAcceso: '/login', badgeColor: 'blue' });
      container.appendChild(fila);
      fila.querySelector('input')?.focus();
    });

    // Clic en el fondo oscuro cierra el modal
    document.querySelectorAll('[data-modal]').forEach((modal) => {
      modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) modal.dataset.clicFondo = '1';
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal && modal.dataset.clicFondo === '1') cerrarModal(modal.id);
        delete modal.dataset.clicFondo;
      });
    });

    document.addEventListener('keydown', (e) => {
      atraparFoco(e);
      if (e.key !== 'Escape') return;
      const modal = modalAbiertoSuperior();
      if (modal) cerrarModal(modal.id);
      else if (!configDropdown.classList.contains('hidden')) configDropdown.classList.add('hidden');
      else if (state.sistemaAbiertoId) volverAlInicio();
    });

    setInterval(() => {
      if (state.serverDisponible && !document.hidden) verificarEstadoPuertos(false);
    }, 10000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.serverDisponible) verificarEstadoPuertos(false);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    leerPreferencias();
    inicializarEventosUI();
    await cargarDatosIniciales();
    aplicarRuta();
  });
})();
