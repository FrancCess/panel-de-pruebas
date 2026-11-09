'use strict';

/**
 * Módulo de Utilidades, Constantes, Iconos SVG y Helpers Compartidos del Panel de Pruebas
 */
(() => {
  const STORAGE_KEY = 'panel_pruebas_proyectos_v1';

  const COLOR_STYLES = {
    indigo: {
      accentBar: 'bg-indigo-600',
      iconTile: 'bg-indigo-600 text-white shadow-indigo-200',
      badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      btnPrimary: 'bg-indigo-600 hover:bg-indigo-700 text-white'
    },
    emerald: {
      accentBar: 'bg-emerald-600',
      iconTile: 'bg-emerald-600 text-white shadow-emerald-200',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      btnPrimary: 'bg-emerald-600 hover:bg-emerald-700 text-white'
    },
    orange: {
      accentBar: 'bg-orange-600',
      iconTile: 'bg-orange-500 text-white shadow-orange-200',
      badge: 'bg-orange-50 text-orange-700 border-orange-200',
      btnPrimary: 'bg-orange-600 hover:bg-orange-700 text-white'
    },
    cyan: {
      accentBar: 'bg-cyan-600',
      iconTile: 'bg-cyan-600 text-white shadow-cyan-200',
      badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      btnPrimary: 'bg-cyan-600 hover:bg-cyan-700 text-white'
    },
    amber: {
      accentBar: 'bg-amber-500',
      iconTile: 'bg-amber-500 text-white shadow-amber-200',
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      btnPrimary: 'bg-amber-600 hover:bg-amber-700 text-white'
    },
    rose: {
      accentBar: 'bg-rose-600',
      iconTile: 'bg-rose-600 text-white shadow-rose-200',
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      btnPrimary: 'bg-rose-600 hover:bg-rose-700 text-white'
    },
    violet: {
      accentBar: 'bg-violet-600',
      iconTile: 'bg-violet-600 text-white shadow-violet-200',
      badge: 'bg-violet-50 text-violet-700 border-violet-200',
      btnPrimary: 'bg-violet-600 hover:bg-violet-700 text-white'
    },
    blue: {
      accentBar: 'bg-blue-600',
      iconTile: 'bg-blue-600 text-white shadow-blue-200',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      btnPrimary: 'bg-blue-600 hover:bg-blue-700 text-white'
    }
  };

  // Botones principales y puntos de color toman el color propio de cada sistema
  // (variables --estampa que se ponen en el contenedor con estiloEstampa).
  Object.values(COLOR_STYLES).forEach((c) => {
    c.btnPrimary = 'btn-estampa';
    c.accentBar = 'punto-estampa';
  });

  /**
   * Color de la "estampa" de cada sistema en el panel de inicio.
   * fondo / texto con contraste legible (los colores claros llevan texto tinta).
   */
  const PALETA_ESTAMPAS = {
    indigo: { fondo: '#2F4BEB', texto: '#FFFFFF', sombra: '47, 75, 235' }, // cobalto
    orange: { fondo: '#FF6B2C', texto: '#1D1A39', sombra: '255, 107, 44' }, // naranja mandarina
    cyan: { fondo: '#16C1D9', texto: '#1D1A39', sombra: '22, 193, 217' }, // turquesa
    amber: { fondo: '#FFB31F', texto: '#1D1A39', sombra: '255, 179, 31' }, // cempasúchil
    emerald: { fondo: '#00A383', texto: '#1D1A39', sombra: '0, 163, 131' }, // jade
    rose: { fondo: '#E2127A', texto: '#FFFFFF', sombra: '226, 18, 122' }, // rosa mexicano
    violet: { fondo: '#7B3FF2', texto: '#FFFFFF', sombra: '123, 63, 242' }, // jacaranda
    blue: { fondo: '#1570CF', texto: '#FFFFFF', sombra: '21, 112, 207' } // azul talavera
  };

  /** Variables CSS para pintar una estampa con el color del sistema. */
  function estiloEstampa(color) {
    const c = PALETA_ESTAMPAS[color] || PALETA_ESTAMPAS.indigo;
    return `--estampa:${c.fondo};--estampa-texto:${c.texto};--estampa-sombra:${c.sombra}`;
  }

  const ROLE_BADGE_STYLES = {
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200'
  };

  const SYSTEM_ICONS_SVG = {
    'graduation-cap': `<svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>`,
    utensils: `<svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
    clock: `<svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    'book-open': `<svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    presentation: `<svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/></svg>`,
    printer: `<svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`,
    'calendar-clock': `<svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><circle cx="16" cy="16" r="6"/><path d="M16 14v2l1 1"/></svg>`,
    users: `<svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    default: `<svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="3"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`
  };

  function obtenerIconoSistemaSVG(nombreIcono) {
    return SYSTEM_ICONS_SVG[nombreIcono] || SYSTEM_ICONS_SVG.default;
  }

  function tieneUsuariosConfigurados(proy) {
    return Array.isArray(proy?.roles) && proy.roles.length > 0;
  }

  // Contraseñas del catálogo que en realidad son notas (mismas que scripts/inicio-sesion.js).
  const CONTRASENAS_NO_AUTOMATIZABLES = [
    'sin contraseña',
    'sin contrasena',
    'pin de sala autogenerado',
    'código de sala',
    'codigo de sala',
    'configurado en cli'
  ];

  /** Indica si el panel puede escribir solo el usuario y la contraseña de este rol. */
  function rolEsAutomatizable(rol) {
    if (!rol || rol.autoLogin === false) return false;
    const pass = String(rol.password || '').trim();
    return Boolean(pass) && !CONTRASENAS_NO_AUTOMATIZABLES.includes(pass.toLowerCase());
  }

  /**
   * Estados posibles de un sistema según /api/status.
   * "sin-confirmar": el puerto responde pero lo comparten varios sistemas y no se sabe cuál es.
   * "ocupado": el puerto lo está usando otro sistema que inició el panel.
   */
  const ESTADOS = {
    online: {
      etiqueta: 'En línea',
      pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      punto: 'bg-emerald-500 status-dot-online'
    },
    'sin-confirmar': {
      etiqueta: 'Puerto activo',
      pill: 'bg-amber-50 text-amber-800 border-amber-200',
      punto: 'bg-amber-500'
    },
    ocupado: {
      etiqueta: 'Puerto ocupado',
      pill: 'bg-rose-50 text-rose-700 border-rose-200',
      punto: 'bg-rose-500'
    },
    apagado: {
      etiqueta: 'Apagado',
      pill: 'bg-slate-100 text-slate-600 border-slate-200',
      punto: 'bg-slate-400'
    }
  };

  /**
   * fetch con JSON que nunca lanza: devuelve { ok:false, error } si la red falla.
   */
  async function peticionJSON(url, { method = 'GET', body } = {}) {
    try {
      const res = await fetch(url, {
        method,
        cache: 'no-store',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = { ok: false, error: `Respuesta inesperada del servidor (HTTP ${res.status}).` };
      }
      if (typeof data.ok !== 'boolean') data.ok = res.ok;
      data.status = res.status;
      return data;
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo conectar con el panel.', sinConexion: true };
    }
  }

  // --- MODALES ACCESIBLES ---
  const pilaFocoModales = [];

  function elementosEnfocables(contenedor) {
    return [
      ...contenedor.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ].filter((el) => el.offsetParent !== null);
  }

  function abrirModal(id, enfocar) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (modal.classList.contains('hidden')) pilaFocoModales.push(document.activeElement);
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    requestAnimationFrame(() => {
      const objetivo = (enfocar && modal.querySelector(enfocar)) || elementosEnfocables(modal)[0];
      if (objetivo) objetivo.focus();
    });
  }

  function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    if (!document.querySelector('[data-modal]:not(.hidden)')) {
      document.body.classList.remove('overflow-hidden');
    }
    const previo = pilaFocoModales.pop();
    if (previo && typeof previo.focus === 'function' && document.contains(previo)) previo.focus();
  }

  function modalAbiertoSuperior() {
    const abiertos = [...document.querySelectorAll('[data-modal]:not(.hidden)')];
    return abiertos[abiertos.length - 1] || null;
  }

  /** Mantiene el foco del teclado dentro del modal abierto (Tab / Shift+Tab). */
  function atraparFoco(e) {
    if (e.key !== 'Tab') return;
    const modal = modalAbiertoSuperior();
    if (!modal) return;
    const focos = elementosEnfocables(modal);
    if (!focos.length) return;
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  function esUrlLocal(url) {
    try {
      const u = new URL(url);
      return (
        (u.protocol === 'http:' || u.protocol === 'https:') &&
        ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname.toLowerCase())
      );
    } catch {
      return false;
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function construirUrlRol(urlBase, rutaAcceso) {
    const base = String(urlBase || 'http://localhost:3000').replace(/\/+$/, '');
    const ruta = String(rutaAcceso || '/').trim();
    if (!ruta || ruta === '/') return base + '/';
    if (ruta.startsWith('http://') || ruta.startsWith('https://')) {
      return esUrlLocal(ruta) ? ruta : base + '/';
    }
    return base + (ruta.startsWith('/') ? ruta : '/' + ruta);
  }

  function actualizarUrlLocalConPuerto(urlBase, nuevoPuerto) {
    try {
      const u = new URL(urlBase || 'http://localhost:3000');
      u.port = String(nuevoPuerto);
      return u.origin;
    } catch {
      return `http://localhost:${nuevoPuerto}`;
    }
  }

  function mostrarToast(titulo, detalle = '', tipo = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const estilos = {
      success: 'border-emerald-200 bg-white text-slate-800',
      info: 'border-indigo-200 bg-white text-slate-800',
      error: 'border-rose-200 bg-white text-slate-800'
    };

    const puntos = {
      success: 'bg-emerald-500',
      info: 'bg-indigo-600',
      error: 'bg-rose-600'
    };

    const toast = document.createElement('div');
    toast.className = `toast-animate pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg ${estilos[tipo] || estilos.info}`;
    toast.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${puntos[tipo] || puntos.info}"></span>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-semibold text-slate-900">${escapeHtml(titulo)}</p>
        ${detalle ? `<p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(detalle)}</p>` : ''}
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, tipo === 'error' ? 7000 : 3200);
  }

  async function copiarAlPortapapeles(texto, etiqueta = 'Texto') {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const resumen = texto.length > 48 ? texto.slice(0, 48) + '...' : texto;
    mostrarToast(`${etiqueta} copiado`, `"${resumen}" listo para pegar (Ctrl+V)`, 'success');
  }

  function descargarArchivoJSON(datos, prefijoNombre) {
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefijoNombre}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderizarSpinnerCarga(titulo, subtitulo = '', colorBorde = 'border-indigo-600') {
    return `
      <div class="py-12 text-center space-y-3">
        <div class="w-9 h-9 rounded-full border-2 ${colorBorde} border-t-transparent animate-spin mx-auto"></div>
        <p class="text-sm font-semibold text-slate-800">${escapeHtml(titulo)}</p>
        ${subtitulo ? `<p class="text-xs text-slate-500">${escapeHtml(subtitulo)}</p>` : ''}
      </div>
    `;
  }

  function aArregloFicha(val) {
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'string' && val.trim()) return [val.trim()];
    return [];
  }

  function formatearListaFicha(val, separador = ', ', porDefecto = '') {
    const arr = aArregloFicha(val);
    return arr.length > 0 ? arr.join(separador) : porDefecto;
  }

  function renderizarBadgesListaFicha(items, badgeClasses) {
    const arr = aArregloFicha(items);
    if (arr.length === 0) {
      return '<span class="text-xs text-slate-400 italic">No detectado</span>';
    }
    return arr
      .map(
        (item) =>
          `<span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${badgeClasses}">${escapeHtml(item)}</span>`
      )
      .join(' ');
  }

  function obtenerMetricasNormalizadas(metricas = {}) {
    return {
      totalArchivos: Number(metricas.totalArchivosCodigo ?? metricas.archivosCodigo ?? 0),
      totalLineas: Number(metricas.lineasDeCodigo ?? metricas.lineasCodigoAprox ?? 0)
    };
  }

  function coincideRolConBusqueda(rolObj, q) {
    if (!q) return true;
    return (
      (rolObj.rol || '').toLowerCase().includes(q) ||
      (rolObj.usuario || '').toLowerCase().includes(q) ||
      (rolObj.permisos || '').toLowerCase().includes(q)
    );
  }

  function coincideProyectoConBusqueda(proy, q) {
    if (!q) return true;
    return (
      (proy.nombre || '').toLowerCase().includes(q) ||
      (proy.subtitulo || '').toLowerCase().includes(q) ||
      (proy.categoria || '').toLowerCase().includes(q) ||
      String(proy.puerto || '').includes(q) ||
      (proy.stack || []).some((s) => s.toLowerCase().includes(q))
    );
  }

  window.PanelPruebas = window.PanelPruebas || {};
  window.PanelPruebas.utils = {
    STORAGE_KEY,
    COLOR_STYLES,
    ROLE_BADGE_STYLES,
    PALETA_ESTAMPAS,
    estiloEstampa,
    obtenerIconoSistemaSVG,
    tieneUsuariosConfigurados,
    rolEsAutomatizable,
    ESTADOS,
    peticionJSON,
    abrirModal,
    cerrarModal,
    modalAbiertoSuperior,
    atraparFoco,
    esUrlLocal,
    escapeHtml,
    construirUrlRol,
    actualizarUrlLocalConPuerto,
    mostrarToast,
    copiarAlPortapapeles,
    descargarArchivoJSON,
    renderizarSpinnerCarga,
    aArregloFicha,
    formatearListaFicha,
    renderizarBadgesListaFicha,
    obtenerMetricasNormalizadas,
    coincideRolConBusqueda,
    coincideProyectoConBusqueda
  };
})();
