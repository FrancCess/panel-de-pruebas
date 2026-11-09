# Panel de pruebas — contexto para Claude Code

Panel local (Node.js sin frameworks) para encender, probar y entrar a mis sistemas web. Responde siempre en español.

## Comandos
- `npm install` — instala `playwright-core` (controla el Chrome instalado para el inicio de sesión automático).
- `npm start` — inicia en http://localhost:4500 y abre el navegador (`iniciar-panel.bat` hace lo mismo).
- `npm test` — 50 pruebas (`tests/qa.test.js` y `tests/inicio-sesion.test.js`). Usan una copia temporal del catálogo: nunca modifican `data/`.
- `npm run build:css` — recompila `public/css/tailwind.css`. **Obligatorio después de agregar o cambiar clases de Tailwind** en `public/index.html` o `public/js/*.js`; no hay CDN.

## Estructura
- `server.js` — API HTTP en 127.0.0.1. Valida Host, Origin, Sec-Fetch-Site y exige `application/json` en los POST (protección contra CSRF y DNS rebinding). No quitar esas validaciones.
- `scripts/utils-proyectos.js` — catálogo, validación (`validarCatalogo`, `validarComandoInicio`), respaldos automáticos en `data/respaldos/`.
- `scripts/inicio-sesion.js` — abre Chrome/Edge, llena el login del rol y deja la sesión iniciada (un contexto aislado por rol).
- `public/` — interfaz: `index.html`, `js/utils.js`, `js/render.js` (estampas del inicio y panel de cada sistema), `js/modals.js`, `js/app.js` (navegación por `#/sistema/<id>`).
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
