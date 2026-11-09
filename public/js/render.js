'use strict';

/**
 * Módulo de Renderizado de Vistas:
 * - Panel de inicio: una estampa de color por sistema
 * - Panel de cada sistema: usuarios, controles, conexión, pruebas y ficha técnica
 */
(() => {
  const {
    COLOR_STYLES,
    ROLE_BADGE_STYLES,
    estiloEstampa,
    esUrlLocal,
    obtenerIconoSistemaSVG,
    tieneUsuariosConfigurados,
    rolEsAutomatizable,
    escapeHtml,
    construirUrlRol,
    aArregloFicha,
    formatearListaFicha,
    renderizarBadgesListaFicha,
    obtenerMetricasNormalizadas,
    coincideRolConBusqueda,
    coincideProyectoConBusqueda
  } = window.PanelPruebas.utils;

  /** Estado de un proyecto: usa /api/status si ya llegó; si no, solo el puerto. */
  function estadoDe(p, state) {
    const info = state.estados && state.estados[p.id];
    if (info && info.puerto === Number(p.puerto)) return info;
    const compartido = state.proyectos.filter((x) => Number(x.puerto) === Number(p.puerto)).length > 1;
    const activo = Boolean(state.puertosActivos[p.puerto]);
    return { estado: activo ? (compartido ? 'sin-confirmar' : 'online') : 'apagado', compartido, ocupadoPor: null };
  }

  const ETIQUETAS_ESTADO = {
    online: 'Encendido',
    'sin-confirmar': 'Puerto activo',
    ocupado: 'Puerto ocupado',
    apagado: 'Apagado'
  };

  function iconoConClase(nombreIcono, clase) {
    return obtenerIconoSistemaSVG(nombreIcono).replace('class="w-9 h-9"', `class="${clase}" aria-hidden="true"`);
  }

  /**
   * Panel de inicio: una estampa de color por sistema y, al final, una para agregar otro.
   */
  function renderizarPanelIconos(proyectos, state, onClickSistema) {
    const grid = document.getElementById('launcherIconsGrid');
    if (!grid) return;

    const estampas = proyectos.map((p) => {
      const info = estadoDe(p, state);
      const numUsuarios = Array.isArray(p.roles) ? p.roles.length : 0;
      const sub = numUsuarios > 0 ? `${numUsuarios} ${numUsuarios === 1 ? 'usuario' : 'usuarios'}` : 'Abre directo';
      const etiqueta = ETIQUETAS_ESTADO[info.estado] || ETIQUETAS_ESTADO.apagado;

      return `
        <button type="button" class="estampa" style="${estiloEstampa(p.color)}"
          data-launcher-id="${escapeHtml(p.id)}"
          aria-label="${escapeHtml(p.nombre)}: ${escapeHtml(etiqueta)}, ${escapeHtml(sub)}">
          ${iconoConClase(p.icono, 'estampa-marca')}
          <span class="estampa-arriba">
            <span class="estampa-icono">${iconoConClase(p.icono, 'w-7 h-7')}</span>
            <span class="estampa-estado estado-${escapeHtml(info.estado)}" title="${escapeHtml(etiqueta)} · puerto ${escapeHtml(p.puerto)}">
              <span class="estampa-punto" aria-hidden="true"></span>${escapeHtml(etiqueta)}
            </span>
          </span>
          <span class="estampa-pie">
            <span class="estampa-nombre">${escapeHtml(p.nombre)}</span>
            <span class="estampa-sub">${escapeHtml(sub)}</span>
          </span>
        </button>
      `;
    });

    estampas.push(`
      <button type="button" class="estampa estampa-nueva" data-launcher-id="__nuevo__">
        <span class="estampa-mas" aria-hidden="true">+</span>
        <span class="estampa-pie">
          <span class="estampa-nombre">Agregar sistema</span>
        </span>
      </button>
    `);

    grid.innerHTML = estampas.join('');

    grid.querySelectorAll('[data-launcher-id]').forEach((btn) => {
      btn.addEventListener('click', () => onClickSistema(btn.getAttribute('data-launcher-id')));
    });
  }

  function renderizarFichaTecnicaHtml(p) {
    const ft = p.fichaTecnica;
    if (!ft) return '';

    const { totalArchivos, totalLineas } = obtenerMetricasNormalizadas(ft.metricas);
    const tablas = aArregloFicha(ft.tablasBaseDatos);
    const runtimeTexto = formatearListaFicha(ft.motorRuntime, ' + ', 'Estándar');
    const bdTexto = formatearListaFicha(ft.baseDatos, ', ', 'Sin BD / En memoria');

    return `
      <div class="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-bold text-slate-900">Ficha Técnica del Sistema</h3>
              <span class="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                ${escapeHtml(ft.tipoArquitectura || 'Aplicación Web')}
              </span>
              ${
                ft.version
                  ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-cred font-semibold bg-slate-100 text-slate-700 border border-slate-200">v${escapeHtml(ft.version)}</span>`
                  : ''
              }
            </div>
          </div>

          <button type="button" data-action="copy-ficha" data-id="${escapeHtml(p.id)}"
            class="h-8 inline-flex items-center px-3 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            title="Copiar Ficha Técnica en formato Markdown">
            Copiar Ficha
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <p class="text-[11px] text-slate-500 font-medium">Motor / Runtime</p>
            <p class="text-xs font-bold text-slate-900 mt-0.5 truncate" title="${escapeHtml(runtimeTexto)}">
              ${escapeHtml(runtimeTexto)}
            </p>
          </div>
          <div class="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <p class="text-[11px] text-slate-500 font-medium">Base de Datos</p>
            <p class="text-xs font-bold text-slate-900 mt-0.5 truncate" title="${escapeHtml(bdTexto)}">
              ${escapeHtml(bdTexto)}
            </p>
          </div>
          <div class="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <p class="text-[11px] text-slate-500 font-medium">Archivos de Código</p>
            <p class="text-xs font-bold font-cred text-slate-900 mt-0.5">
              ${totalArchivos.toLocaleString()} archivos
            </p>
          </div>
          <div class="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <p class="text-[11px] text-slate-500 font-medium">Volumen de Código</p>
            <p class="text-xs font-bold font-cred text-indigo-600 mt-0.5">
              ~${totalLineas.toLocaleString()} líneas
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div class="border border-slate-200 rounded-xl p-3.5 space-y-2">
            <p class="font-bold text-slate-700">Lenguajes y Backend</p>
            <div class="flex flex-wrap gap-1.5">
              ${renderizarBadgesListaFicha([...aArregloFicha(ft.lenguajes), ...aArregloFicha(ft.backend)], 'bg-indigo-50/80 text-indigo-700 border-indigo-200')}
            </div>
          </div>

          <div class="border border-slate-200 rounded-xl p-3.5 space-y-2">
            <p class="font-bold text-slate-700">Frontend e Interfaz</p>
            <div class="flex flex-wrap gap-1.5">
              ${renderizarBadgesListaFicha(ft.frontend, 'bg-cyan-50/80 text-cyan-700 border-cyan-200')}
            </div>
          </div>

          <div class="border border-slate-200 rounded-xl p-3.5 space-y-2">
            <p class="font-bold text-slate-700">Librerías y Módulos Clave</p>
            <div class="flex flex-wrap gap-1.5">
              ${renderizarBadgesListaFicha(ft.libreriasClave, 'bg-emerald-50/80 text-emerald-700 border-emerald-200')}
            </div>
          </div>

          <div class="border border-slate-200 rounded-xl p-3.5 space-y-2">
            <p class="font-bold text-slate-700">Seguridad y Autenticación</p>
            <div class="flex flex-wrap gap-1.5">
              ${renderizarBadgesListaFicha(ft.seguridad, 'bg-amber-50/80 text-amber-800 border-amber-200')}
            </div>
          </div>
        </div>

        ${
          tablas.length > 0
            ? `<div class="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50/50">
                <p class="text-xs font-bold text-slate-700">
                  Entidades / Tablas Detectadas en Esquema (${tablas.length})
                </p>
                <div class="flex flex-wrap gap-1.5">
                  ${tablas
                    .map(
                      (t) =>
                        `<span class="font-cred text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">${escapeHtml(t)}</span>`
                    )
                    .join('')}
                </div>
              </div>`
            : ''
        }
      </div>
    `;
  }

  function nombreDe(state, id) {
    const p = state.proyectos.find((x) => x.id === id);
    return p ? p.nombre : id;
  }

  function avisoPuerto(p, state) {
    const info = estadoDe(p, state);
    const otros = state.proyectos.filter((x) => x.id !== p.id && Number(x.puerto) === Number(p.puerto));
    if (!otros.length && info.estado !== 'ocupado') return '';
    const nombres = otros.map((x) => x.nombre).join(', ');

    if (info.estado === 'ocupado') {
      return `<div class="aviso aviso-rojo" role="alert">
          <p>El puerto :${escapeHtml(p.puerto)} lo usa ${escapeHtml(nombreDe(state, info.ocupadoPor))}.</p>
          <button type="button" data-action="start-free-port" data-id="${escapeHtml(p.id)}" class="aviso-boton">Mover a puerto libre e iniciar</button>
        </div>`;
    }
    if (info.estado === 'sin-confirmar') {
      return `<div class="aviso aviso-ambar">
          <p>El puerto :${escapeHtml(p.puerto)} está activo y también lo usan ${escapeHtml(nombres)}.</p>
          <button type="button" data-action="start-free-port" data-id="${escapeHtml(p.id)}" class="aviso-boton">Mover a puerto libre e iniciar</button>
        </div>`;
    }
    return `<div class="aviso">
        <p>Comparte el puerto :${escapeHtml(p.puerto)} con ${escapeHtml(nombres)}.</p>
        <button type="button" data-action="auto-free-port" data-id="${escapeHtml(p.id)}" class="aviso-enlace">Asignar puerto propio</button>
      </div>`;
  }

  function filaUsuario(p, r, state) {
    const badgeClass = ROLE_BADGE_STYLES[r.badgeColor] || ROLE_BADGE_STYLES.blue;
    const clave = `${p.id}__${r.id}`;
    const verClave = state.mostrarTodasClaves || state.clavesVisiblesIndividuales.has(clave);
    const automatico = rolEsAutomatizable(r);
    const url = construirUrlRol(p.urlBase, r.rutaAcceso);

    return `
      <article class="usuario">
        <div class="usuario-cabeza">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border ${badgeClass}">${escapeHtml(r.rol)}</span>
          <span class="chip-dato font-cred">${escapeHtml(r.rutaAcceso || '/')}</span>
          ${r.pin ? `<button type="button" data-action="copy-pin" data-pin="${escapeHtml(r.pin)}" class="chip-dato chip-pin font-cred" title="Copiar PIN">PIN ${escapeHtml(r.pin)}</button>` : ''}
        </div>

        <div class="usuario-credenciales">
          <div class="credencial">
            <span class="credencial-etiqueta">Usuario</span>
            <span class="credencial-valor font-cred" title="${escapeHtml(r.usuario)}">${escapeHtml(r.usuario || '—')}</span>
            <button type="button" data-action="copy-user" data-value="${escapeHtml(r.usuario)}" class="credencial-boton" aria-label="Copiar usuario de ${escapeHtml(r.rol)}">Copiar</button>
          </div>
          <div class="credencial">
            <span class="credencial-etiqueta">Contraseña</span>
            <span class="credencial-valor font-cred">${verClave ? escapeHtml(r.password || '—') : '••••••••'}</span>
            <button type="button" data-action="toggle-pass" data-role-key="${escapeHtml(clave)}" aria-pressed="${verClave}" class="credencial-boton" aria-label="${verClave ? 'Ocultar' : 'Ver'} contraseña de ${escapeHtml(r.rol)}">${verClave ? 'Ocultar' : 'Ver'}</button>
            <button type="button" data-action="copy-pass" data-value="${escapeHtml(r.password)}" class="credencial-boton" aria-label="Copiar contraseña de ${escapeHtml(r.rol)}">Copiar</button>
          </div>
        </div>

        <button type="button" class="usuario-entrar btn-estampa"
          data-action="launch-role"
          data-project-id="${escapeHtml(p.id)}"
          data-url="${escapeHtml(url)}"
          data-user="${escapeHtml(r.usuario)}"
          data-pass="${escapeHtml(r.password)}"
          data-rol="${escapeHtml(r.rol)}"
          data-role-id="${escapeHtml(r.id)}"
          title="${automatico ? 'Abre una ventana de Chrome con la sesión iniciada' : 'Abre el sistema y copia la contraseña'}">
          ${automatico ? 'Entrar' : 'Abrir'}
        </button>
      </article>
    `;
  }

  /**
   * Panel de un sistema: usuarios, controles del servidor, conexión, pruebas y ficha técnica.
   */
  function renderizarVistaSistema(p, state) {
    const cont = document.getElementById('vistaSistema');
    if (!cont || !p) return;

    const info = estadoDe(p, state);
    const etiqueta = ETIQUETAS_ESTADO[info.estado] || ETIQUETAS_ESTADO.apagado;
    const encendido = info.estado === 'online' || info.estado === 'sin-confirmar';
    const script = p.archivoBat || p.comandoInicio || '';
    const puedeIniciar = state.serverDisponible && Boolean(script);
    const puedeDetener = state.serverDisponible && Boolean(p.archivoBatDetener);
    const trabajando = state.ocupados.has(p.id);
    const roles = p.roles || [];
    const urlSegura = esUrlLocal(p.urlBase) ? p.urlBase : '';

    let control = '';
    if (trabajando) {
      control = `<span class="boton-cabecera boton-principal" aria-live="polite"><span class="girando" aria-hidden="true"></span>Trabajando…</span>`;
    } else if (info.estado === 'apagado' && puedeIniciar) {
      control = `<button type="button" data-action="start-project" data-id="${escapeHtml(p.id)}" class="boton-cabecera boton-principal">Encender</button>`;
    } else if (encendido && puedeDetener) {
      control = `
        <button type="button" data-action="restart-project" data-id="${escapeHtml(p.id)}" class="boton-cabecera">Reiniciar</button>
        <button type="button" data-action="stop-project" data-id="${escapeHtml(p.id)}" class="boton-cabecera">Detener</button>`;
    }

    cont.setAttribute('style', estiloEstampa(p.color));
    cont.innerHTML = `
      <header class="sistema-cabecera">
        ${iconoConClase(p.icono, 'sistema-marca')}
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 relative">
          <div class="flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <button type="button" data-action="volver" class="sistema-volver" aria-label="Volver a Sistemas" title="Volver a Sistemas">
                <span aria-hidden="true">←</span>
              </button>
              <span class="sistema-icono">${iconoConClase(p.icono, 'w-6 h-6')}</span>
              <div class="min-w-0">
                <h2 id="tituloSistema" tabindex="-1" class="sistema-nombre font-display">${escapeHtml(p.nombre)}</h2>
                <div class="mt-1 flex flex-wrap gap-1.5">
                  <span class="pastilla estado-${escapeHtml(info.estado)}"><span class="estampa-punto" aria-hidden="true"></span>${escapeHtml(etiqueta)}</span>
                  <span class="pastilla font-cred">:${escapeHtml(p.puerto)}</span>
                  ${p.categoria ? `<span class="pastilla">${escapeHtml(p.categoria)}</span>` : ''}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              ${control}
              ${p.carpetaLocal && state.serverDisponible ? `<button type="button" data-action="open-folder" data-folder="${escapeHtml(p.carpetaLocal)}" class="boton-cabecera">Carpeta</button>` : ''}
              <button type="button" data-action="edit-project" data-id="${escapeHtml(p.id)}" class="boton-cabecera">Editar</button>
              <button type="button" data-action="toggle-fav" data-id="${escapeHtml(p.id)}" aria-pressed="${Boolean(p.favorito)}"
                class="boton-cabecera boton-cuadrado" title="${p.favorito ? 'Quitar de destacados' : 'Destacar'}">${p.favorito ? '★' : '☆'}</button>
            </div>
          </div>
        </div>
      </header>

      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <section aria-label="Usuarios">
          ${roles.length ? `<h3 class="seccion-titulo font-display">Usuarios <span class="seccion-cuenta">${roles.length}</span></h3>` : ''}
          ${
            roles.length
              ? `<div class="space-y-3">${roles.map((r) => filaUsuario(p, r, state)).join('')}</div>`
              : `<div class="tarjeta text-center py-12">
                  <button type="button" class="btn-estampa usuario-entrar mx-auto"
                    data-action="launch-role" data-project-id="${escapeHtml(p.id)}" data-url="${escapeHtml(p.urlBase)}"
                    data-user="" data-pass="" data-rol="${escapeHtml(p.nombre)}">Abrir ${escapeHtml(p.nombre)}</button>
                </div>`
          }
        </section>

        <aside class="space-y-5">
          ${avisoPuerto(p, state)}

          <section class="tarjeta" aria-labelledby="tituloConexion">
            <h3 id="tituloConexion" class="tarjeta-titulo font-display">Conexión</h3>
            <dl class="datos">
              <div><dt>Dirección</dt><dd>${
                urlSegura
                  ? `<a href="${escapeHtml(urlSegura)}" target="_blank" rel="noopener noreferrer" class="enlace font-cred">${escapeHtml(urlSegura)}</a>`
                  : `<span class="font-cred text-rose-600">${escapeHtml(p.urlBase || '—')}</span>`
              }</dd></div>
              <div><dt><label for="quickPortInput_${escapeHtml(p.id)}">Puerto</label></dt><dd>
                <span class="flex flex-wrap items-center gap-1.5">
                  <input type="number" inputmode="numeric" min="1" max="65535" id="quickPortInput_${escapeHtml(p.id)}"
                    data-quick-port-id="${escapeHtml(p.id)}" value="${escapeHtml(p.puerto)}" class="campo-puerto font-cred" />
                  <button type="button" data-action="apply-quick-port" data-id="${escapeHtml(p.id)}" class="boton-chico">Cambiar</button>
                  <button type="button" data-action="auto-free-port" data-id="${escapeHtml(p.id)}" class="boton-chico">Buscar libre</button>
                </span>
              </dd></div>
              <div><dt>Inicio</dt><dd class="font-cred">${escapeHtml(script || '—')}</dd></div>
              ${p.archivoBatDetener ? `<div><dt>Detener</dt><dd class="font-cred">${escapeHtml(p.archivoBatDetener)}</dd></div>` : ''}
              ${p.carpetaLocal ? `<div><dt>Carpeta</dt><dd class="font-cred break-all">${escapeHtml(p.carpetaLocal)}</dd></div>` : ''}
            </dl>
          </section>

          <section class="tarjeta" aria-labelledby="tituloPruebas">
            <h3 id="tituloPruebas" class="tarjeta-titulo font-display">Pruebas</h3>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" data-action="audit-project" data-id="${escapeHtml(p.id)}" class="boton-prueba">Auditoría OWASP</button>
              <button type="button" data-action="load-test-project" data-id="${escapeHtml(p.id)}" class="boton-prueba">Simular usuarios</button>
            </div>
          </section>

          ${
            p.notasSistema
              ? `<section class="tarjeta" aria-labelledby="tituloNotas">
                  <h3 id="tituloNotas" class="tarjeta-titulo font-display">Notas</h3>
                  <p class="text-sm text-slate-600 leading-relaxed">${escapeHtml(p.notasSistema)}</p>
                </section>`
              : ''
          }
        </aside>
      </div>

      ${p.fichaTecnica ? `<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">${renderizarFichaTecnicaHtml(p)}</div>` : ''}
    `;
  }

  window.PanelPruebas.render = {
    renderizarPanelIconos,
    renderizarVistaSistema,
    estadoDe
  };
})();
