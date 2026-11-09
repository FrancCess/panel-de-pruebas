'use strict';

/**
 * Submódulo de Modal: Formulario CRUD de Sistema, Roles y Autodetección desde Carpeta.
 */
(() => {
  const {
    escapeHtml,
    mostrarToast,
    peticionJSON,
    abrirModal,
    cerrarModal,
    esUrlLocal
  } = window.PanelPruebas.utils;

  // Mismas reglas que valida el servidor (src/services/catalogo/validacion.js).
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

  async function detectarDesdeCarpeta() {
    const inputCarpeta = document.getElementById('formCarpetaLocal');
    const carpetaLocal = inputCarpeta.value.trim();
    if (!carpetaLocal) {
      marcarError(inputCarpeta, 'Escribe la carpeta del proyecto.');
      return;
    }

    const boton = document.getElementById('btnDetectarCarpeta');
    boton.disabled = true;
    const data = await peticionJSON('/api/detect-project', {
      method: 'POST',
      body: { carpetaLocal, id: document.getElementById('formProjectId').value }
    });
    boton.disabled = false;

    if (!data.ok) {
      mostrarToast('No se pudo leer la carpeta', data.error || '', 'error');
      return;
    }

    const p = data.proyecto || {};
    const llenados = [];
    const poner = (id, valor, etiqueta, soloSiVacio = false) => {
      const input = document.getElementById(id);
      if (valor === '' || valor === null || valor === undefined) return;
      if (soloSiVacio && input.value.trim()) return;
      input.value = valor;
      llenados.push(etiqueta);
    };

    poner('formNombre', p.nombre, 'nombre', true);
    poner('formSubtitulo', p.subtitulo, 'descripción', true);
    poner('formStack', (p.stack || []).join(', '), 'tecnologías');
    poner('formComandoInicio', p.comandoInicio, 'comando');
    poner('formPuerto', p.puerto, 'puerto');
    poner('formUrlBase', p.urlBase, 'URL');

    if (data.puertoOcupadoPor) {
      mostrarToast(`Puerto :${p.puerto} en uso`, `Lo usa ${data.puertoOcupadoPor}.`, 'error');
    } else if (llenados.length) {
      mostrarToast('Datos detectados', llenados.join(', '), 'success');
    } else {
      mostrarToast('Sin datos detectados', '', 'info');
    }
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

  window.PanelPruebas = window.PanelPruebas || {};
  window.PanelPruebas.modalProyecto = {
    crearFilaFormularioRol,
    abrirModalProyecto,
    cerrarModalProyecto,
    detectarDesdeCarpeta,
    guardarFormularioProyecto,
    eliminarProyectoActual
  };
})();
