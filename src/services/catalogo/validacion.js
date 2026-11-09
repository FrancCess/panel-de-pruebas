'use strict';

/**
 * Validación de seguridad para el catálogo de proyectos, comandos de inicio y rutas de acceso.
 */

const path = require('node:path');
const { LIMITES } = require('../../config/rutas-sistema');
const { esUrlLocalSegura } = require('../../utils/urls');

const PATRON_ID = /^[A-Za-z0-9_-]{1,80}$/;
// Caracteres que permitirían encadenar o redirigir comandos en cmd.exe.
const METACARACTERES_SHELL = /[&|<>^%!"'`;()$\r\n]/;
const PATRON_BAT = /^[\w .\-\\/]+\.bat$/i;
const PATRON_COMANDO = /^(npm|pnpm|yarn|node|python|python3|py|php|composer|flask|uvicorn)(\s+[\w.\-:/\\=@]+)*$/i;

/**
 * Valida el comando de inicio de un proyecto.
 * Se permite: vacío, un archivo .bat relativo a la carpeta del proyecto, o un comando
 * de herramientas de desarrollo conocidas (npm run dev, python run.py, php artisan serve...).
 */
function validarComandoInicio(comando) {
  const c = String(comando ?? '').trim();
  if (!c) return { ok: true, valor: '' };
  if (c.length > LIMITES.maxTextoCorto) return { ok: false, error: 'El comando es demasiado largo.' };
  if (METACARACTERES_SHELL.test(c)) {
    return { ok: false, error: 'El comando contiene caracteres no permitidos (& | < > ^ % ! " \' ` ; ( ) $).' };
  }
  if (c.toLowerCase().endsWith('.bat')) {
    if (!PATRON_BAT.test(c) || c.split(/[\\/]/).includes('..') || path.isAbsolute(c)) {
      return { ok: false, error: 'El .bat debe ser una ruta relativa dentro de la carpeta del proyecto.' };
    }
    return { ok: true, valor: c };
  }
  if (!PATRON_COMANDO.test(c)) {
    return {
      ok: false,
      error: 'Usa un archivo .bat o un comando que empiece con npm, node, python, py, php, composer, yarn o pnpm.'
    };
  }
  return { ok: true, valor: c };
}

/**
 * Valida la ruta de acceso de un rol: debe ser relativa (/login) o una URL de localhost.
 */
function validarRutaAcceso(ruta) {
  const r = String(ruta ?? '').trim() || '/';
  if (r.length > LIMITES.maxTextoCorto) return false;
  if (/^https?:\/\//i.test(r)) return esUrlLocalSegura(r);
  return !/^[a-z][a-z0-9+.-]*:/i.test(r) && !r.startsWith('//');
}

function textoSeguro(valor, max = LIMITES.maxTextoCorto) {
  return String(valor ?? '').slice(0, max);
}

/**
 * Valida y normaliza un catálogo completo. Devuelve { ok, proyectos, errores }.
 */
function validarCatalogo(datos) {
  const errores = [];
  if (!Array.isArray(datos)) {
    return { ok: false, proyectos: [], errores: ['Se esperaba un arreglo de proyectos.'] };
  }
  if (datos.length > LIMITES.maxProyectos) {
    return { ok: false, proyectos: [], errores: [`Máximo ${LIMITES.maxProyectos} proyectos.`] };
  }

  const ids = new Set();
  const proyectos = datos.map((p, i) => {
    const etiqueta = `Proyecto #${i + 1}${p && p.nombre ? ` (${p.nombre})` : ''}`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      errores.push(`${etiqueta}: formato inválido.`);
      return null;
    }
    if (!PATRON_ID.test(String(p.id || ''))) errores.push(`${etiqueta}: id inválido (solo letras, números, - y _).`);
    else if (ids.has(p.id)) errores.push(`${etiqueta}: id duplicado "${p.id}".`);
    ids.add(p.id);

    if (!String(p.nombre || '').trim()) errores.push(`${etiqueta}: falta el nombre.`);

    const puerto = Number(p.puerto);
    if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
      errores.push(`${etiqueta}: puerto inválido.`);
    }
    if (p.urlBase && !esUrlLocalSegura(p.urlBase)) {
      errores.push(`${etiqueta}: la URL base debe apuntar a localhost o 127.0.0.1.`);
    }

    for (const campo of ['comandoInicio', 'archivoBat', 'archivoBatDetener']) {
      if (!p[campo]) continue;
      const v = validarComandoInicio(p[campo]);
      if (!v.ok) errores.push(`${etiqueta}: ${campo} — ${v.error}`);
      else if (campo !== 'comandoInicio' && !v.valor.toLowerCase().endsWith('.bat')) {
        errores.push(`${etiqueta}: ${campo} debe ser un archivo .bat.`);
      }
    }

    if (!Array.isArray(p.roles)) {
      errores.push(`${etiqueta}: roles debe ser un arreglo.`);
    } else {
      if (p.roles.length > LIMITES.maxRolesPorProyecto) errores.push(`${etiqueta}: demasiados roles.`);
      p.roles.forEach((r, j) => {
        if (!r || typeof r !== 'object') {
          errores.push(`${etiqueta}: rol #${j + 1} inválido.`);
          return;
        }
        if (!validarRutaAcceso(r.rutaAcceso)) {
          errores.push(`${etiqueta}: la ruta del rol "${r.rol || j + 1}" debe ser relativa (/login) o de localhost.`);
        }
      });
    }

    return {
      ...p,
      id: String(p.id || ''),
      nombre: textoSeguro(p.nombre).trim(),
      subtitulo: textoSeguro(p.subtitulo, LIMITES.maxTextoLargo),
      categoria: textoSeguro(p.categoria || 'General'),
      puerto,
      notasSistema: textoSeguro(p.notasSistema, LIMITES.maxTextoLargo),
      stack: Array.isArray(p.stack) ? p.stack.map((s) => textoSeguro(s)).slice(0, 40) : [],
      roles: Array.isArray(p.roles)
        ? p.roles.map((r) => ({
            ...r,
            id: textoSeguro(r && r.id),
            rol: textoSeguro(r && r.rol),
            usuario: textoSeguro(r && r.usuario),
            password: textoSeguro(r && r.password),
            pin: textoSeguro(r && r.pin),
            rutaAcceso: textoSeguro((r && r.rutaAcceso) || '/'),
            permisos: textoSeguro(r && r.permisos, LIMITES.maxTextoLargo)
          }))
        : []
    };
  });

  return { ok: errores.length === 0, proyectos: errores.length ? [] : proyectos, errores };
}

module.exports = {
  validarComandoInicio,
  validarRutaAcceso,
  validarCatalogo
};
