'use strict';

/**
 * Submódulo de Modal: Historial y Restauración de Respaldos del Catálogo.
 */
(() => {
  const {
    escapeHtml,
    mostrarToast,
    renderizarSpinnerCarga,
    peticionJSON,
    abrirModal,
    cerrarModal
  } = window.PanelPruebas.utils;

  function formatearFecha(iso) {
    if (!iso) return 'Fecha desconocida';
    try {
      return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  async function abrirModalRespaldos({ onRestaurado }) {
    const content = document.getElementById('backupsModalContent');
    abrirModal('backupsModal', '#btnCloseBackupsModal');
    content.innerHTML = renderizarSpinnerCarga('Buscando respaldos…');

    const data = await peticionJSON('/api/backups');
    if (!data.ok) {
      content.innerHTML = `<p class="text-xs text-rose-700" role="alert">${escapeHtml(data.error || 'No se pudieron leer los respaldos.')}</p>`;
      return;
    }
    if (!data.respaldos.length) {
      content.innerHTML = `
        <div class="py-8 text-center space-y-1">
          <p class="text-sm font-semibold text-slate-800">Todavía no hay respaldos</p>
        </div>`;
      return;
    }

    content.innerHTML = `
      <ul class="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
        ${data.respaldos
          .map(
            (r, i) => `
            <li class="flex items-center justify-between gap-3 px-4 py-3">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-slate-800">${escapeHtml(formatearFecha(r.fecha))}${
                  i === 0 ? ' <span class="ml-1 text-[10px] font-bold uppercase text-indigo-600">más reciente</span>' : ''
                }</p>
                <p class="text-[11px] text-slate-500 font-cred truncate">${escapeHtml(r.nombre)} · ${r.totalSistemas} sistemas</p>
              </div>
              <button type="button" data-restaurar="${escapeHtml(r.nombre)}"
                class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition disabled:opacity-60">
                Restaurar
              </button>
            </li>`
          )
          .join('')}
      </ul>
    `;

    content.querySelectorAll('[data-restaurar]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nombre = btn.getAttribute('data-restaurar');
        if (!confirm('¿Reemplazar el catálogo actual por este respaldo?')) return;
        btn.disabled = true;
        const res = await peticionJSON('/api/backups/restore', { method: 'POST', body: { nombre } });
        btn.disabled = false;
        if (!res.ok) {
          mostrarToast('No se pudo restaurar', res.error || '', 'error');
          return;
        }
        cerrarModalRespaldos();
        await onRestaurado(res.proyectos);
        mostrarToast('Catálogo restaurado', `${res.proyectos.length} sistemas cargados`, 'success');
      });
    });
  }

  function cerrarModalRespaldos() {
    cerrarModal('backupsModal');
  }

  window.PanelPruebas = window.PanelPruebas || {};
  window.PanelPruebas.modalRespaldos = {
    abrirModalRespaldos,
    cerrarModalRespaldos
  };
})();
