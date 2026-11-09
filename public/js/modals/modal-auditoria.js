'use strict';

/**
 * Submódulo de Modal: Auditoría Defensiva de Seguridad (OWASP Top 10 / CWE).
 */
(() => {
  const {
    escapeHtml,
    descargarArchivoJSON,
    renderizarSpinnerCarga,
    peticionJSON,
    abrirModal,
    cerrarModal
  } = window.PanelPruebas.utils;

  let ultimoReporteAuditoria = [];

  async function ejecutarAuditoriaSeguridad(projectId = null) {
    const content = document.getElementById('auditModalContent');
    const title = document.getElementById('auditModalTitle');

    abrirModal('auditModal', '#btnCloseAuditModal');
    title.textContent = projectId
      ? 'Analizando Seguridad del Sistema...'
      : 'Analizando Todos los Sistemas (OWASP)...';

    content.innerHTML = renderizarSpinnerCarga(
      'Inspeccionando código fuente, cabeceras HTTP y configuración...'
    );

    const btnExport = document.getElementById('btnExportAuditReport');
    btnExport.disabled = true;
    const url = projectId ? `/api/audit?id=${encodeURIComponent(projectId)}` : '/api/audit';
    const data = await peticionJSON(url);
    if (data.ok && Array.isArray(data.reportes)) {
      ultimoReporteAuditoria = data.reportes;
      btnExport.disabled = false;
      title.textContent =
        data.reportes.length === 1
          ? `Auditoría de Seguridad: ${data.reportes[0].nombre}`
          : `Auditoría Global (${data.reportes.length} sistemas)`;
      renderizarResultadosAuditoria(data.reportes);
    } else {
      title.textContent = 'Auditoría de Seguridad (OWASP)';
      content.innerHTML = `
        <div class="p-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs" role="alert">
          No se pudo ejecutar la auditoría: ${escapeHtml(
            data.sinConexion ? 'asegúrate de que el servidor del panel esté corriendo.' : data.error || 'error desconocido.'
          )}
        </div>
      `;
    }
  }

  function renderizarResultadosAuditoria(reportes) {
    const content = document.getElementById('auditModalContent');

    const gradoBadge = (grado) => {
      const map = {
        A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        B: 'bg-blue-50 text-blue-700 border-blue-200',
        C: 'bg-amber-50 text-amber-800 border-amber-200',
        D: 'bg-rose-50 text-rose-700 border-rose-200'
      };
      return map[grado] || map.B;
    };

    const estadoPill = (estado) => {
      const config = {
        pass: ['Cumple', 'bg-emerald-50 text-emerald-700 border border-emerald-200'],
        warn: ['Advertencia', 'bg-amber-50 text-amber-800 border border-amber-200'],
        fail: ['Crítico', 'bg-rose-50 text-rose-700 border border-rose-200']
      };
      const [label, classes] = config[estado] || ['Info', 'bg-slate-100 text-slate-600'];
      return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${classes}">${label}</span>`;
    };

    content.innerHTML = reportes
      .map((r) => {
        const itemsHtml = (r.hallazgos || [])
          .map(
            (h) => `
              <div class="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                <div class="flex flex-wrap items-center gap-2">
                  ${estadoPill(h.estado)}
                  ${
                    h.owasp
                      ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700">${escapeHtml(h.owasp)}</span>`
                      : ''
                  }
                  ${
                    h.cwe
                      ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-cred bg-slate-100 text-slate-600">${escapeHtml(h.cwe)}</span>`
                      : ''
                  }
                  <span class="text-xs font-bold text-slate-900">${escapeHtml(h.control)}</span>
                </div>
                ${
                  h.evidencia
                    ? `<p class="text-[11px] font-cred text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 overflow-x-auto">
                        Archivo: ${escapeHtml(h.evidencia)}
                      </p>`
                    : ''
                }
                <p class="text-xs text-slate-600">${escapeHtml(h.detalle)}</p>
                ${
                  h.remediacion
                    ? `<p class="text-[11px] text-indigo-900 bg-indigo-50/70 border border-indigo-200 rounded-lg px-2.5 py-1.5">
                        <strong>Recomendación:</strong> ${escapeHtml(h.remediacion)}
                      </p>`
                    : ''
                }
              </div>
            `
          )
          .join('');

        return `
          <div class="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-base font-bold text-slate-900">${escapeHtml(r.nombre)}</h3>
                  <span class="text-xs font-cred text-slate-400">${escapeHtml(r.urlBase)}</span>
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                    ${r.online ? `En línea (${r.latenciaMs || 1} ms)` : `${r.archivosEscaneados || 0} archivos analizados`}
                  </span>
                </div>
                <p class="text-xs text-slate-500 mt-1">
                  ${r.estadisticas.pass} controles OK · ${r.estadisticas.warn} advertencias · ${r.estadisticas.fail} por corregir
                </p>
              </div>

              <div class="flex items-center gap-2.5">
                <div class="text-right">
                  <span class="block text-[10px] uppercase tracking-wider text-slate-400">Puntaje</span>
                  <span class="text-base font-bold text-slate-900">${r.score}%</span>
                </div>
                <span class="w-10 h-10 rounded-xl border flex items-center justify-center text-base font-black ${gradoBadge(r.grado)}">
                  ${escapeHtml(r.grado)}
                </span>
              </div>
            </div>

            <div class="space-y-2.5">
              ${itemsHtml}
            </div>
          </div>
        `;
      })
      .join('');
  }

  function cerrarModalAuditoria() {
    cerrarModal('auditModal');
  }

  function exportarReporteAuditoria() {
    if (!ultimoReporteAuditoria.length) return;
    descargarArchivoJSON(ultimoReporteAuditoria, 'auditoria-owasp');
  }

  window.PanelPruebas = window.PanelPruebas || {};
  window.PanelPruebas.modalAuditoria = {
    ejecutarAuditoriaSeguridad,
    cerrarModalAuditoria,
    exportarReporteAuditoria
  };
})();
