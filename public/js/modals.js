'use strict';

/**
 * Módulo de Modales:
 * 1. CRUD de Proyectos y Roles
 * 2. Auditoría Defensiva de Seguridad (OWASP)
 * 3. Simulador de Usuarios Concurrentes y Punto de Quiebre
 */
(() => {
  const {
    escapeHtml,
    mostrarToast,
    descargarArchivoJSON,
    renderizarSpinnerCarga,
    peticionJSON,
    abrirModal,
    cerrarModal,
    esUrlLocal
  } = window.PanelPruebas.utils;

  // Mismas reglas que valida el servidor (scripts/utils-proyectos.js).
  const METACARACTERES_SHELL = /[&|<>^%!"'`;()$\r\n]/;
  const PATRON_BAT = /^[\w .\-\\/]+\.bat$/i;
  const PATRON_COMANDO = /^(npm|pnpm|yarn|node|python|python3|py|php|composer|flask|uvicorn)(\s+[\w.\-:/\\=@]+)*$/i;

  function validarComandoLocal(cmd) {
    const c = String(cmd || '').trim();
    if (!c) return '';
    if (METACARACTERES_SHELL.test(c)) return 'El comando contiene caracteres no permitidos (& | < > ^ % ! " \' ` ; ( ) $).';
    if (c.toLowerCase().endsWith('.bat')) {
      if (!PATRON_BAT.test(c) || c.split(/[\\/]/).includes('..')) return 'El .bat debe estar dentro de la carpeta del proyecto.';
      return '';
    }
    if (!PATRON_COMANDO.test(c)) return 'Usa un archivo .bat o un comando como "npm run dev" o "python run.py".';
    return '';
  }

  function crearSlug(texto) {
    const base = String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    return base || 'sistema';
  }

  function marcarError(input, mensaje) {
    input.setCustomValidity(mensaje);
    input.reportValidity();
    input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
  }

  let ultimoReporteAuditoria = [];
  let proyectoLoadTestId = null;

  // --- 1. MODAL CRUD DE SISTEMA Y ROLES ---
  function crearFilaFormularioRol(rolData = {}) {
    const div = document.createElement('div');
    div.className = 'role-form-row bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3';
    div.setAttribute('data-role-id', rolData.id || `rol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

    div.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div class="sm:col-span-3">
          <label class="block text-[11px] font-medium text-slate-600 mb-1">Nombre del Rol *</label>
          <input type="text" data-field="rol" aria-label="Nombre del rol" required value="${escapeHtml(rolData.rol || '')}" placeholder="Ej. Administrador"
            class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500" />
        </div>
        <div class="sm:col-span-3">
          <label class="block text-[11px] font-medium text-slate-600 mb-1">Usuario / Correo *</label>
          <input type="text" data-field="usuario" aria-label="Usuario o correo" required value="${escapeHtml(rolData.usuario || '')}" placeholder="admin@ejemplo.test"
            class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-cred focus:outline-none focus:border-indigo-500" />
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[11px] font-medium text-slate-600 mb-1">Contraseña *</label>
          <input type="text" data-field="password" aria-label="Contraseña" required value="${escapeHtml(rolData.password || '')}" placeholder="password"
            class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-indigo-700 font-cred focus:outline-none focus:border-indigo-500" />
        </div>
        <div class="sm:col-span-1">
          <label class="block text-[11px] font-medium text-slate-600 mb-1">PIN</label>
          <input type="text" data-field="pin" aria-label="PIN" value="${escapeHtml(rolData.pin || '')}" placeholder="1234"
            class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-cred focus:outline-none focus:border-indigo-500" />
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[11px] font-medium text-slate-600 mb-1">Ruta Login</label>
          <input type="text" data-field="rutaAcceso" aria-label="Ruta de login" value="${escapeHtml(rolData.rutaAcceso || '/login')}" placeholder="/login"
            class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-cred focus:outline-none focus:border-indigo-500" />
        </div>
        <div class="sm:col-span-1">
          <label class="block text-[11px] font-medium text-slate-600 mb-1">Color</label>
          <select data-field="badgeColor" aria-label="Color del rol"
            class="w-full px-1.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500">
            <option value="purple" ${rolData.badgeColor === 'purple' ? 'selected' : ''}>Morado</option>
            <option value="blue" ${rolData.badgeColor === 'blue' ? 'selected' : ''}>Azul</option>
            <option value="emerald" ${rolData.badgeColor === 'emerald' ? 'selected' : ''}>Verde</option>
            <option value="amber" ${rolData.badgeColor === 'amber' ? 'selected' : ''}>Ámbar</option>
            <option value="rose" ${rolData.badgeColor === 'rose' ? 'selected' : ''}>Rosa</option>
            <option value="cyan" ${rolData.badgeColor === 'cyan' ? 'selected' : ''}>Cian</option>
          </select>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <input type="text" data-field="permisos" aria-label="Descripción del rol" value="${escapeHtml(rolData.permisos || '')}"
          placeholder="Descripción corta de qué hace o prueba este rol..."
          class="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-indigo-500" />
        <label class="shrink-0 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-slate-600 cursor-pointer select-none"
          title="El panel abre una ventana de Chrome y escribe el usuario y la contraseña de este rol">
          <input type="checkbox" data-field="autoLogin" class="w-3.5 h-3.5 accent-indigo-600" ${rolData.autoLogin === false ? '' : 'checked'} />
          Entrar solo
        </label>
        <button type="button" aria-label="Quitar este rol" class="btn-remove-role px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition">
          Quitar
        </button>
      </div>
    `;

    div.querySelector('.btn-remove-role').addEventListener('click', () => {
      const siguiente = div.nextElementSibling || div.previousElementSibling;
      div.remove();
      siguiente?.querySelector('input')?.focus();
    });

    return div;
  }

  function abrirModalProyecto(projectId, state) {
    const title = document.getElementById('modalTitle');
    const btnDelete = document.getElementById('btnDeleteProject');
    const rolesContainer = document.getElementById('rolesFormContainer');

    rolesContainer.innerHTML = '';

    const proyecto = projectId ? state.proyectos.find((p) => p.id === projectId) : null;

    if (proyecto) {
      title.textContent = `Editar: ${proyecto.nombre}`;
      btnDelete.classList.remove('hidden');
      document.getElementById('formProjectId').value = proyecto.id;
      document.getElementById('formNombre').value = proyecto.nombre || '';
      document.getElementById('formSubtitulo').value = proyecto.subtitulo || '';
      document.getElementById('formCategoria').value = proyecto.categoria || 'Académico';
      document.getElementById('formColor').value = proyecto.color || 'indigo';
      document.getElementById('formUrlBase').value = proyecto.urlBase || 'http://localhost:3000';
      document.getElementById('formPuerto').value = proyecto.puerto || 3000;
      document.getElementById('formStack').value = (proyecto.stack || []).join(', ');
      document.getElementById('formCarpetaLocal').value = proyecto.carpetaLocal || '';
      document.getElementById('formComandoInicio').value = proyecto.archivoBat || proyecto.comandoInicio || '';
      document.getElementById('formFavorito').checked = Boolean(proyecto.favorito);
      document.getElementById('formNotasSistema').value = proyecto.notasSistema || '';

      (proyecto.roles || []).forEach((r) => {
        rolesContainer.appendChild(crearFilaFormularioRol(r));
      });
    } else {
      title.textContent = 'Nuevo Sistema Web';
      btnDelete.classList.add('hidden');
      document.getElementById('formProjectId').value = '';
      document.getElementById('formNombre').value = '';
      document.getElementById('formSubtitulo').value = '';
      document.getElementById('formCategoria').value = 'Académico';
      document.getElementById('formColor').value = 'indigo';
      document.getElementById('formUrlBase').value = 'http://localhost:3000';
      document.getElementById('formPuerto').value = 3000;
      document.getElementById('formStack').value = 'Node.js, Express';
      document.getElementById('formCarpetaLocal').value = '';
      document.getElementById('formComandoInicio').value = 'iniciar.bat';
      document.getElementById('formFavorito').checked = false;
      document.getElementById('formNotasSistema').value = '';

      rolesContainer.appendChild(
        crearFilaFormularioRol({
          rol: 'Administrador',
          badgeColor: 'purple',
          usuario: 'admin@ejemplo.test',
          password: 'CambiaEsta-123',
          rutaAcceso: '/login',
          permisos: 'Control total del sistema'
        })
      );
    }

    abrirModal('projectModal', '#formNombre');
  }

  function cerrarModalProyecto() {
    cerrarModal('projectModal');
  }

  async function guardarFormularioProyecto(state, callbacks) {
    const form = document.getElementById('projectForm');
    // Limpiar errores de un intento anterior antes de volver a validar.
    form.querySelectorAll('input').forEach((input) => input.setCustomValidity(''));
    if (!form.reportValidity()) return;

    const inputUrl = document.getElementById('formUrlBase');
    if (!esUrlLocal(inputUrl.value.trim())) {
      marcarError(inputUrl, 'La URL debe ser de localhost o 127.0.0.1 (por ejemplo http://localhost:3000).');
      return;
    }
    const inputCmd = document.getElementById('formComandoInicio');
    const errorCmd = validarComandoLocal(inputCmd.value);
    if (errorCmd) {
      marcarError(inputCmd, errorCmd);
      return;
    }
    for (const inputRuta of document.querySelectorAll('#rolesFormContainer [data-field="rutaAcceso"]')) {
      const ruta = inputRuta.value.trim() || '/';
      const absoluta = /^https?:\/\//i.test(ruta);
      if ((absoluta && !esUrlLocal(ruta)) || (!absoluta && (/^[a-z][a-z0-9+.-]*:/i.test(ruta) || ruta.startsWith('//')))) {
        marcarError(inputRuta, 'La ruta debe ser relativa (/login) o de localhost.');
        return;
      }
    }

    const existingId = document.getElementById('formProjectId').value.trim();
    const nombre = document.getElementById('formNombre').value.trim();
    const urlBase = document.getElementById('formUrlBase').value.trim();
    let puerto = Number(document.getElementById('formPuerto').value);

    if (!puerto) {
      try {
        const parsed = new URL(urlBase);
        puerto = Number(parsed.port) || 3000;
      } catch {
        puerto = 3000;
      }
    }

    const rolesRows = [...document.querySelectorAll('#rolesFormContainer .role-form-row')];
    const roles = rolesRows.map((row) => ({
      id: row.getAttribute('data-role-id'),
      rol: row.querySelector('[data-field="rol"]').value.trim() || 'Usuario',
      usuario: row.querySelector('[data-field="usuario"]').value.trim(),
      password: row.querySelector('[data-field="password"]').value.trim(),
      pin: row.querySelector('[data-field="pin"]').value.trim(),
      rutaAcceso: row.querySelector('[data-field="rutaAcceso"]').value.trim() || '/',
      badgeColor: row.querySelector('[data-field="badgeColor"]').value,
      permisos: row.querySelector('[data-field="permisos"]').value.trim(),
      autoLogin: row.querySelector('[data-field="autoLogin"]').checked
    }));

    const stack = document
      .getElementById('formStack')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const cmdVal = document.getElementById('formComandoInicio').value.trim();
    const proyectoExistente = existingId ? state.proyectos.find((p) => p.id === existingId) : null;

    let nuevoId = existingId;
    if (!nuevoId) {
      const base = crearSlug(nombre);
      nuevoId = base;
      let n = 2;
      while (state.proyectos.some((p) => p.id === nuevoId)) nuevoId = `${base}-${n++}`;
    }

    const nuevoObjeto = {
      ...(proyectoExistente || {}),
      id: nuevoId,
      nombre,
      subtitulo: document.getElementById('formSubtitulo').value.trim(),
      categoria: document.getElementById('formCategoria').value.trim() || 'General',
      color: document.getElementById('formColor').value,
      urlBase,
      puerto,
      stack,
      carpetaLocal: document.getElementById('formCarpetaLocal').value.trim(),
      comandoInicio: cmdVal,
      archivoBat: cmdVal.toLowerCase().endsWith('.bat') ? cmdVal : '',
      favorito: document.getElementById('formFavorito').checked,
      notasSistema: document.getElementById('formNotasSistema').value.trim(),
      roles
    };

    const anteriores = state.proyectos.slice();
    if (existingId) {
      const idx = state.proyectos.findIndex((p) => p.id === existingId);
      if (idx !== -1) state.proyectos[idx] = nuevoObjeto;
    } else {
      state.proyectos.unshift(nuevoObjeto);
    }

    const btnGuardar = document.getElementById('btnSaveProject');
    btnGuardar.disabled = true;
    const ok = await callbacks.guardarProyectosEnAlmacenamiento();
    btnGuardar.disabled = false;
    if (!ok) {
      // El servidor rechazó los datos: se deja el modal abierto para corregir.
      state.proyectos = anteriores;
      return;
    }

    state.sistemaSeleccionadoId = nuevoObjeto.id;
    cerrarModalProyecto();
    await callbacks.recargarDesdeServidor();
    callbacks.verificarEstadoPuertos();
    mostrarToast('Guardado correctamente', `${nombre} (${roles.length} ${roles.length === 1 ? 'rol' : 'roles'})`, 'success');
  }

  async function eliminarProyectoActual(state, callbacks) {
    const existingId = document.getElementById('formProjectId').value.trim();
    if (!existingId) return;
    const proy = state.proyectos.find((p) => p.id === existingId);
    if (!proy) return;

    if (!confirm(`¿Seguro que deseas eliminar "${proy.nombre}"? Podrás recuperarlo desde Opciones → Restaurar un respaldo.`)) return;

    const anteriores = state.proyectos;
    state.proyectos = state.proyectos.filter((p) => p.id !== existingId);
    const ok = await callbacks.guardarProyectosEnAlmacenamiento();
    if (!ok) {
      state.proyectos = anteriores;
      return;
    }
    cerrarModalProyecto();
    callbacks.asegurarSistemaSeleccionado();
    callbacks.renderizarTodo();
    mostrarToast('Sistema eliminado', proy.nombre, 'info');
  }

  // --- 2. AUDITORÍA DEFENSIVA OWASP ---
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

  // --- 3. SIMULADOR DE USUARIOS CONCURRENTES Y PUNTO DE QUIEBRE ---
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

  // --- 4. RESPALDOS DEL CATÁLOGO ---
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


  window.PanelPruebas.modals = {
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
  };
})();
