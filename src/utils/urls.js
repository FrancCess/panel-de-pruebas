'use strict';

/**
 * Utilidades de validación y construcción de URLs locales y asignación de puertos.
 */

/**
 * Verifica que una URL apunte exclusivamente a localhost / 127.0.0.1 / ::1.
 */
function esUrlLocalSegura(urlString) {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Construye una URL completa combinando la URL base del proyecto y la ruta del rol.
 */
function construirUrlRol(urlBase, rutaAcceso) {
  const base = String(urlBase || 'http://localhost:3000').replace(/\/+$/, '');
  const ruta = String(rutaAcceso || '/').trim();
  if (!ruta || ruta === '/') return base + '/';
  if (ruta.startsWith('http://') || ruta.startsWith('https://')) return ruta;
  return base + (ruta.startsWith('/') ? ruta : '/' + ruta);
}

/**
 * Obtiene la lista de URLs únicas de acceso de los roles de un proyecto.
 */
function obtenerUrlsRutasProyecto(proyecto) {
  const rutasUnicas = [...new Set((proyecto.roles || []).map((r) => r.rutaAcceso || '/'))];
  // Solo se devuelven URLs locales: una ruta absoluta hacia otro sitio nunca debe recibir tráfico.
  const urls = rutasUnicas
    .map((ruta) => construirUrlRol(proyecto.urlBase, ruta))
    .filter((url) => esUrlLocalSegura(url));
  if (urls.length === 0) {
    return [construirUrlRol(proyecto.urlBase, '/')];
  }
  return urls;
}

/**
 * Actualiza el puerto de una URL base manteniendo protocolo y host.
 */
function actualizarUrlConPuerto(urlBase, nuevoPuerto) {
  try {
    const u = new URL(urlBase || 'http://localhost:3000');
    u.port = String(nuevoPuerto);
    return u.origin;
  } catch {
    return `http://localhost:${nuevoPuerto}`;
  }
}

/**
 * Obtiene el conjunto de puertos asignados a otros proyectos en el catálogo.
 */
function obtenerPuertosOcupadosCatalogo(proyectos, excludeProjectId = '') {
  return new Set(
    proyectos
      .filter((p) => p.id !== excludeProjectId)
      .map((p) => Number(p.puerto))
      .filter((n) => Number.isInteger(n) && n > 0)
  );
}

module.exports = {
  esUrlLocalSegura,
  construirUrlRol,
  obtenerUrlsRutasProyecto,
  actualizarUrlConPuerto,
  obtenerPuertosOcupadosCatalogo
};
