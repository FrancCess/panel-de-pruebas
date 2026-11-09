'use strict';

/**
 * Submódulo de Acciones de Proyectos:
 * Encendido, reinicio, detención, cambio de puerto, escaneo .bat, ficha técnica Markdown e importación/exportación JSON.
 */
(() => {
  const {
    actualizarUrlLocalConPuerto,
    mostrarToast,
    copiarAlPortapapeles,
    descargarArchivoJSON,
    aArregloFicha,
    formatearListaFicha,
    obtenerMetricasNormalizadas
  } = window.PanelPruebas.utils;

  function crearAccionesProyectos(state, deps) {
    const {
      guardarEnLocalStorage,
      guardarProyectosEnAlmacenamiento,
      asegurarSistemaSeleccionado,
      renderizarTodo,
      verificarEstadoPuertos
    } = deps;

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

    return {
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
    };
  }

  window.PanelPruebas = window.PanelPruebas || {};
  window.PanelPruebas.accionesProyectos = { crearAccionesProyectos };
})();
