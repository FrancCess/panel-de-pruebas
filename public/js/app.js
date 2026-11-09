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
    peticionJSON,
    actualizarUrlLocalConPuerto,
    mostrarToast,
    copiarAlPortapapeles,
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

  const { crearAccionesProyectos } = window.PanelPruebas.accionesProyectos;
  const { crearAccionesSesion } = window.PanelPruebas.accionesSesion;

  const PREFS_KEY = 'panel_pruebas_preferencias_v1';

  const state = {
    proyectos: [],
    sistemaAbiertoId: null,
    sistemaSeleccionadoId: null,
    puertosActivos: {},
    estados: {},
    serverDisponible: false,
    autoStartBat: true,
    autoLogin: true,
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

  // --- INSTANCIAR ACCIONES MODULARES ---
  const {
    peticionIniciarProyecto,
    activarSistemaConBat,
    detenerSistemaConBat,
    escanearBatsEnProyectos,
    cambiarPuertoDeProyecto,
    copiarFichaTecnicaMarkdown,
    abrirCarpetaEnExplorador,
    exportarCatalogoJSON,
    importarCatalogoJSON,
    restaurarCatalogoPorDefecto
  } = crearAccionesProyectos(state, {
    guardarEnLocalStorage,
    guardarProyectosEnAlmacenamiento,
    asegurarSistemaSeleccionado,
    renderizarTodo,
    verificarEstadoPuertos
  });

  const { lanzarRolConAutoActivacion } = crearAccionesSesion(state, {
    verificarEstadoPuertos,
    peticionIniciarProyecto
  });

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
