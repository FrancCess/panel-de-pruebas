# Panel de pruebas — contexto para Claude Code

Panel local (Node.js sin frameworks) para encender, probar y entrar a mis sistemas web. Responde siempre en español.

## Comandos
- `npm install` — instala `playwright-core` (controla el Chrome instalado para el inicio de sesión automático).
- `npm start` — inicia en http://localhost:4500 y abre el navegador (`iniciar-panel.bat` hace lo mismo).
- `npm test` — 50 pruebas (`tests/qa.test.js` y `tests/inicio-sesion.test.js`). Usan una copia temporal del catálogo: nunca modifican `data/`.
- `npm run build:css` — recompila `public/css/tailwind.css`. **Obligatorio después de agregar o cambiar clases de Tailwind** en `public/index.html` o `public/js/*.js`; no hay CDN.

## Estructura
- `server.js` — Punto de entrada ligero del servidor HTTP en 127.0.0.1.
- `src/` — Arquitectura modular del backend:
  - `src/config/` — Rutas del sistema (`rutas-sistema.js`) y constantes (`constantes.js`).
  - `src/utils/` — Utilidades transversales (`archivos.js`, `urls.js`, `cli.js`).
  - `src/services/catalogo/` — Repositorio de proyectos (`repositorio.js`), validación (`validacion.js`) y respaldos automáticos en `data/respaldos/` (`respaldos.js`).
  - `src/services/procesos/` — Puertos TCP y estados (`puertos.js`), detección de `.bat` (`scripts-bat.js`) y arranque/detención de servidores (`lanzador.js`).
  - `src/services/deteccion/` — Autodetección de carpeta (`detector-proyecto.js`) y generador de ficha técnica (`ficha-tecnica.js`).
  - `src/services/auditoria/` — Motor OWASP modularizado en SAST (`sast.js`), DAST (`dast.js`), evaluadores (`evaluadores.js`) y orquestador (`index.js`).
  - `src/services/carga/` — Simulador de concurrencia y estrés (`prueba-carga.js`).
  - `src/services/sesion/` — Inicio de sesión automático en Chrome/Edge aislado por rol (`inicio-sesion.js`).
  - `src/http/` — Servidor HTTP (`servidor.js`), rutas API (`rutas-api.js`), archivos estáticos (`estaticos.js`), respuestas (`respuestas.js`) y validaciones de Host, Origin, Sec-Fetch-Site y `application/json` (`seguridad-http.js`). No quitar esas validaciones.
- `scripts/` — Puntos de entrada CLI y adaptadores de compatibilidad (`utils-proyectos.js`, `inicio-sesion.js`, `detector-ficha-tecnica.js`, `detector-proyecto.js`, `prueba-carga.js`, `auditoria-seguridad.js`).
- `public/` — Interfaz modularizada: `index.html`, `js/utils.js`, `js/render.js`, `js/modals/` (`modal-proyecto.js`, `modal-auditoria.js`, `modal-carga.js`, `modal-respaldos.js`), `js/modals.js`, `js/actions/` (`proyectos-acciones.js`, `sesion-acciones.js`) y `js/app.js` (navegación por `#/sistema/<id>`).
- `tools/tailwind.config.js` — paleta: `indigo` = rosa mexicano, `slate` = tinta. Colores de cada sistema en `PALETA_ESTAMPAS` (`public/js/utils.js`).

## Reglas
- **Nunca subir a git** `data/proyectos.json`, `data/respaldos/`, `public/js/default-data.js` ni `_respaldo*/`: contienen contraseñas de mis sistemas. Ya están en `.gitignore`; solo se publica `data/proyectos.ejemplo.json`.
- En pruebas y ejemplos usar solo credenciales inventadas (`ClaveDemo-1`, `admin@ejemplo.test`), nunca las de mi catálogo.
- Diseño: estilo "feria" (rosa mexicano, cobalto, cempasúchil, jade sobre lila; barra superior color tinta con franja de cuatro colores). Interfaz sin textos explicativos: solo títulos, datos y botones.
- Comandos de inicio permitidos: `.bat` dentro de la carpeta del proyecto o `npm`/`node`/`python`/`py`/`php`/`composer`/`yarn`/`pnpm` sin `& | < > ^ % ! " ' ; ( ) $`.

## Pendiente de verificar en Windows
- `npm test` con Chrome real (las 10 pruebas de inicio de sesión se omiten si no hay navegador).
- Reiniciar / Detener con los `.bat` reales de BistroSoft.
- Inicio de sesión automático contra los sistemas reales (Horas puede pedir cambio de contraseña al primer login).
