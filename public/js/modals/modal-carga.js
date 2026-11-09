'use strict';

/**
 * Submódulo de Modal: Simulador de Usuarios Concurrentes y Punto de Quiebre.
 */
(() => {
  const {
    escapeHtml,
    renderizarSpinnerCarga,
    peticionJSON,
    abrirModal,
    cerrarModal
  } = window.PanelPruebas.utils;

  let proyectoLoadTestId = null;

  function abrirModalPruebaCarga(projectId, state) {
    const proy = state.proyectos.find((p) => p.id === projectId);
    if (!proy) return;

    proyectoLoadTestId = projectId;
    const title = document.getElementById('loadTestModalTitle');
    const content = document.getElementById('loadTestModalContent');

    title.textContent = `Simular Usuarios Concurrentes: ${proy.nombre}`;
    abrirModal('loadTestModal', '#btnStartLoadTest');

    const estado = window.PanelPruebas.render.estadoDe(proy, state).estado;
    const isOnline = estado === 'online' || estado === 'sin-confirmar';

    content.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3 shadow-sm">
        <h3 class="text-sm font-bold text-slate-900">Listo para medir la capacidad de ${escapeHtml(proy.nombre)}</h3>
        ${
          !isOnline
            ? `<div class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <span>Apagado (:${escapeHtml(proy.puerto)})</span>
              </div>`
            : `<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Servidor activo en ${escapeHtml(proy.urlBase)}</span>
              </div>`
        }
      </div>
    `;
  }

  async function correrPruebaCargaActual(state, callbacks) {
    if (!proyectoLoadTestId) return;
    const proy = state.proyectos.find((p) => p.id === proyectoLoadTestId);
    if (!proy) return;

    const modo = document.getElementById('selectLoadMode').value;
    const maxUsuarios = Number(document.getElementById('selectMaxUsers').value) || 200;
    const content = document.getElementById('loadTestModalContent');
    const btnStart = document.getElementById('btnStartLoadTest');

    btnStart.disabled = true;
    btnStart.classList.add('opacity-60');

    const estadoActual = window.PanelPruebas.render.estadoDe(proy, state).estado;
    if (estadoActual === 'apagado' && state.autoStartBat && state.serverDisponible) {
      content.innerHTML = renderizarSpinnerCarga(
        `Encendiendo ${proy.nombre} (${proy.archivoBat || proy.comandoInicio})...`,
        `Esperando a que el puerto :${proy.puerto} esté listo antes de lanzar los usuarios virtuales.`,
        'border-emerald-600'
      );
      await callbacks.peticionIniciarProyecto(proy.id, { esperar: true });
    }

    content.innerHTML = renderizarSpinnerCarga(
      `Simulando hasta ${maxUsuarios} usuarios simultáneos en ${proy.nombre}...`,
      'Midiendo peticiones por segundo (RPS), tiempos de respuesta (p95) y límite de saturación.'
    );

    try {
      const data = await peticionJSON('/api/load-test', {
        method: 'POST',
        body: { id: proy.id, maxUsuarios, modo }
      });

      if (!data.ok && (data.sinConexion || data.status !== 200)) {
        content.innerHTML = `
          <div class="p-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs" role="alert">
            No se pudo ejecutar la simulación: ${escapeHtml(data.error || 'error desconocido.')}
          </div>
        `;
        return;
      }

      if (!data.ok) {
        content.innerHTML = `
          <div class="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-3 text-center">
            <p class="text-sm font-bold">El servidor del sistema está apagado</p>
            <p class="text-xs text-amber-800">${escapeHtml(data.error || '')}</p>
            <button type="button" id="btnQuickStartForLoad"
              class="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition">
              Activar servidor (.bat) y volver a intentar
            </button>
          </div>
        `;
        const btnQuick = document.getElementById('btnQuickStartForLoad');
        if (btnQuick) {
          btnQuick.addEventListener('click', async () => {
            await callbacks.activarSistemaConBat(proy.id);
            correrPruebaCargaActual(state, callbacks);
          });
        }
        return;
      }

      renderizarResultadosPruebaCarga(data);
    } catch (err) {
      content.innerHTML = `
        <div class="p-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          Error durante la prueba de carga: ${escapeHtml(err.message)}
        </div>
      `;
    } finally {
      btnStart.disabled = false;
      btnStart.classList.remove('opacity-60');
    }
  }

  function renderizarResultadosPruebaCarga(data) {
    const content = document.getElementById('loadTestModalContent');
    const res = data.resumen || {};

    const filasHtml = (data.escalones || [])
      .map((e) => {
        const badge =
          e.estado === 'optimo'
            ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Fluido / Estable</span>`
            : e.estado === 'degradado'
            ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">Lento (Degradado)</span>`
            : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Saturación / Colapso</span>`;

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-4 font-bold text-slate-900">${e.usuarios} usuarios</td>
            <td class="py-3 px-4 font-cred text-xs text-slate-600">${e.peticionesTotales}</td>
            <td class="py-3 px-4 font-cred text-xs font-semibold text-indigo-600">${e.rps} req/s</td>
            <td class="py-3 px-4 font-cred text-xs text-slate-700">${e.promedioMs} ms</td>
            <td class="py-3 px-4 font-cred text-xs ${e.p95Ms > 600 ? 'text-amber-600 font-bold' : 'text-slate-700'}">${e.p95Ms} ms</td>
            <td class="py-3 px-4 font-cred text-xs ${e.tasaErrorPct > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}">${e.tasaErrorPct}%</td>
            <td class="py-3 px-4 text-right">${badge}</td>
          </tr>
        `;
      })
      .join('');

    content.innerHTML = `
      <div class="space-y-5">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="bg-white border border-slate-200 rounded-xl p-3.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Capacidad Fluida</span>
            <p class="text-lg font-bold text-emerald-600 mt-0.5">${res.usuariosOptimos ? `~${res.usuariosOptimos} usuarios` : 'Revisar'}</p>
            <span class="text-[11px] text-slate-500">Sin errores y rápido</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-3.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Inicio de Lentitud</span>
            <p class="text-lg font-bold text-amber-600 mt-0.5">${res.puntoDegradacion ? `${res.puntoDegradacion} usuarios` : 'No alcanzado'}</p>
            <span class="text-[11px] text-slate-500">Latencia > 650 ms</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-3.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Punto de Quiebre</span>
            <p class="text-lg font-bold ${res.puntoColapso ? 'text-rose-600' : 'text-slate-700'} mt-0.5">
              ${res.puntoColapso ? `${res.puntoColapso} usuarios` : `>${res.maxUsuariosProbados} (No colapsó)`}
            </p>
            <span class="text-[11px] text-slate-500">Timeouts o fallos HTTP</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-3.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Rendimiento Pico</span>
            <p class="text-lg font-bold text-indigo-600 mt-0.5">${res.rpsMaximo || 0} req/seg</p>
            <span class="text-[11px] text-slate-500">Capacidad máxima medida</span>
          </div>
        </div>

        <div class="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-4">
          <p class="text-xs font-bold text-indigo-950">Conclusión de la Prueba de Capacidad</p>
          <p class="text-xs text-indigo-900 mt-1 leading-relaxed">${escapeHtml(res.diagnostico || '')}</p>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th class="py-3 px-4">Usuarios al mismo tiempo</th>
                  <th class="py-3 px-4">Peticiones</th>
                  <th class="py-3 px-4">Velocidad (RPS)</th>
                  <th class="py-3 px-4">Tiempo Promedio</th>
                  <th class="py-3 px-4">Tiempo p95</th>
                  <th class="py-3 px-4">% Fallos</th>
                  <th class="py-3 px-4 text-right">Comportamiento</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filasHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function cerrarModalPruebaCarga() {
    cerrarModal('loadTestModal');
  }

  window.PanelPruebas = window.PanelPruebas || {};
  window.PanelPruebas.modalCarga = {
    abrirModalPruebaCarga,
    correrPruebaCargaActual,
    cerrarModalPruebaCarga
  };
})();
