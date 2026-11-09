# Panel Central de Pruebas Web

Plataforma local centralizada para gestionar, iniciar y probar todos los proyectos web del entorno de desarrollo desde una sola interfaz limpia, organizada por **sistema** y por **rol de usuario**.

---

## Inicio Rápido

### Opción 1: Con un doble clic (Recomendado en Windows)
Ejecuta el archivo **[`iniciar-panel.bat`](iniciar-panel.bat)**.  
El script levanta el servidor local en `http://localhost:4500` y abre el navegador en cuanto está listo. Si el puerto 4500 está ocupado, el panel usa el siguiente libre (4501, 4502…) y abre esa dirección.

### Opción 2: Desde terminal
```powershell
npm install        # solo la primera vez (instala el control de Chrome para iniciar sesión solo)
npm start          # igual que el .bat: inicia y abre el navegador
node server.js     # solo inicia el servidor
```
Luego abre en tu navegador: **`http://localhost:4500`**

> **Modo sin servidor:** También puedes abrir directamente `public/index.html` en el navegador. Solo sirve para consultar credenciales (usa `localStorage` y el catálogo en `public/js/default-data.js`).

> **Sin internet:** los estilos están compilados en `public/css/tailwind.css`, así que el panel se ve igual sin conexión. Si cambias clases de Tailwind en el HTML o JS, recompila con `npm run build:css`.

---

## Inicio de sesión automático (versión 1.2)

Al dar clic en **Entrar** en un usuario, el panel abre una ventana de **Chrome** (o Edge si no hay Chrome), entra a la página de login del sistema, escribe el usuario y la contraseña y envía el formulario. La ventana queda con la sesión iniciada.

- **Instalación (una sola vez):** en la carpeta del panel ejecuta `npm install`. Instala `playwright-core`, que controla el Chrome que ya tienes; no descarga otro navegador.
- **Si el sistema está apagado**, primero ejecuta su `.bat` y espera a que responda (hasta 40 s).
- **Cada rol tiene su propia ventana y su propia sesión**, así que puedes tener al Administrador y a otro rol del mismo sistema abiertos a la vez. Si vuelves a dar clic en un rol cuya ventana sigue abierta, el panel la trae al frente.
- **Funciona con los logins de todos los sistemas:** formularios normales (incluido el CSRF de Laravel), logins hechos con `fetch`, formularios que se dibujan con JavaScript y pantallas de solo PIN.
- **Si la contraseña es incorrecta**, el panel muestra el mensaje del propio sistema y deja la ventana abierta para que revises.
- **Roles que no se automatizan:** los que no tienen una contraseña fija ("Sin contraseña", "Código de Sala", "PIN de sala autogenerado", "Configurado en CLI") o a los que les desmarques **Entrar solo** en el formulario. Esos se abren como antes: en tu navegador, con la contraseña copiada.
- Se puede apagar en **Opciones → Iniciar sesión automáticamente**.
- **Sistemas sin roles** (como Gestor de Horarios o Gestor de Personal) arrancan directo al dar clic en su ícono.

## Novedades de la versión 1.1

- **Seguridad:** la API solo acepta peticiones del propio panel (bloquea CSRF y DNS rebinding), valida el catálogo antes de guardarlo y solo permite comandos de inicio seguros (`.bat` dentro de la carpeta del proyecto o `npm`/`python`/`php`/`node`…).
- **Respaldos automáticos:** antes de cada cambio se guarda una copia en `data/respaldos/` (se conservan las 25 más recientes). Se restauran desde **Opciones → Restaurar un respaldo…**
- **Estados reales por sistema:** *En línea*, *Puerto activo (sin confirmar)* cuando varios sistemas comparten puerto, *Ocupado por X* cuando el panel sabe qué sistema lo usa, y *Apagado*.
- **Reiniciar funciona:** ejecuta el `.bat` de detención, espera a que el puerto se libere y vuelve a iniciar.
- **"Entrar como" más confiable:** espera hasta 45 s a que el sistema arranque y, si falla, muestra el motivo en la pestaña en lugar de una página rota.
- **Interfaz:** adaptada a celular, navegable con teclado, con modales accesibles y avisos que se pueden cerrar.
- **Pruebas:** 36 pruebas automáticas que trabajan sobre una copia del catálogo (nunca modifican tus datos).

---

## Características Principales

### 1. Accesos Directos y Credenciales por Sistema y Rol
- **Panel de inicio**: una estampa de color por sistema con su estado (`Encendido` / `Apagado`). Al tocarla se abre el panel de ese sistema.
- **Panel de cada sistema** (`#/sistema/<id>`): usuarios con botón **Entrar**, encender / reiniciar / detener, conexión y puerto, pruebas (auditoría y simulador), notas y ficha técnica. `Esc` o el botón "Sistemas" regresan al inicio.
- **Tarjetas por Rol**: Cada rol muestra su usuario/correo, contraseña (oculta por defecto con botón **Ver/Ocultar**), PIN opcional, ruta de acceso (`/login`, `/admin`, `/teacher.html`, etc.) y resumen de permisos.
- **Acceso en 1 clic (`Entrar como <Rol>`)**: Copia automáticamente la contraseña al portapapeles (`Ctrl + V`) y abre la ruta de inicio de sesión del rol correspondiente.

### 2. Activación Automática de Scripts `.bat`
- Escanea las carpetas de cada proyecto al iniciar el panel (y con **Opciones → Escanear carpetas**) buscando scripts de arranque (`iniciar-sistema.bat`, `iniciar_sistema.bat`, `iniciar.bat`, `detener_sistema.bat`). Si elegiste un `.bat` o un comando a mano, el escaneo lo respeta.
- Si un proyecto está **Apagado** y haces clic en **`Entrar como <Rol>`**, el panel ejecuta automáticamente su archivo `.bat`, espera a que el puerto TCP responda y redirige al login del sistema.

### 3. Ajuste Rápido de Puertos y Buscador de Puerto Libre
- En la barra de red de cada sistema puedes:
  - **Cambiar el puerto manualmente**: Escribir cualquier puerto (`1`–`65535`) y hacer clic en **Ajustar** (o presionar `Enter`), actualizando automáticamente su URL base (`http://localhost:<puerto>`).
  - **Buscar puerto libre (`Buscar libre`)**: Verifica por TCP qué puertos no están ocupados ni asignados a otros proyectos del catálogo y asigna el siguiente disponible.
  - **Resolver conflictos de puertos compartidos**: Si varios sistemas usan el puerto `:3000` o `:8000` y uno ya está activo, el botón **Cambiar a puerto libre e iniciar** asigna un puerto libre e inyecta las variables de entorno (`PORT`, `SERVER_PORT`, `FLASK_RUN_PORT`, `VITE_PORT`) al lanzar el `.bat`.

### 4. Detección Automática de Tecnologías y Ficha Técnica
- El módulo `scripts/detector-ficha-tecnica.js` analiza automáticamente `package.json`, `composer.json`, `requirements.txt`, esquemas `.sql`, migraciones y archivos de código fuente de cada proyecto.
- Genera y muestra en pantalla la **Ficha Técnica del Sistema**:
  - Arquitectura y versión del sistema.
  - Motor / Runtime (`Node.js`, `PHP ^8.2`, `Python 3.10+`).
  - Lenguajes, frameworks de Backend y Frontend.
  - Motor de Base de Datos y listado de **tablas detectadas** en el esquema.
  - Librerías clave, módulos de seguridad y métricas de código (total de archivos y líneas de código aproximadas).
  - Botón **Copiar Ficha** para exportar la ficha técnica en formato Markdown al portapapeles.

### 5. Simulador de Usuarios Concurrentes (Pruebas de Carga y Estrés)
- Permite simular oleadas progresivas de usuarios conectados al mismo tiempo (`10 → 25 → 50 → 100 → 200 → 300 → 400` usuarios concurrentes) exclusivamente sobre `localhost`.
- Mide:
  - **Capacidad fluida**: Cantidad de usuarios simultáneos sin errores y con baja latencia.
  - **Inicio de lentitud (Degradación)**: Punto donde la latencia `p95` supera los `650 ms`.
  - **Punto de quiebre (Colapso)**: Punto donde ocurren errores HTTP `5xx`, rechazos de conexión o timeouts.
  - **Rendimiento pico**: Peticiones por segundo (`RPS`).

### 6. Auditoría Defensiva de Seguridad (OWASP Top 10)
- Combina análisis estático de código fuente (**SAST**) y verificación pasiva de cabeceras HTTP y rutas (**DAST**) sobre `localhost`:
  - Detección de consultas SQL concatenadas (`CWE-89`), uso de `innerHTML` sin sanitizar (`CWE-79`) y secretos en código (`CWE-798`).
  - Verificación de hash de contraseñas (`bcrypt` / `argon2`), protección contra fuerza bruta (`rate-limit`), límites de carga de archivos y cabeceras HTTP (`CSP`, `X-Frame-Options`, `X-Content-Type-Options`, cookies `HttpOnly`).
  - Calificación de `A` a `D` con recomendaciones de remediación y exportación del reporte en `.json`.

---

## Tu catálogo de sistemas

El panel guarda tus sistemas, puertos y credenciales en `data/proyectos.json`. **Ese archivo no se sube a GitHub** (está en `.gitignore`), igual que sus respaldos y `public/js/default-data.js`.

La primera vez que arrancas el panel sin `data/proyectos.json`, se copia el catálogo de ejemplo (`data/proyectos.ejemplo.json`), con tres sistemas y credenciales inventadas. Edítalos desde el panel o agrega los tuyos con la estampa **+**.

Las carpetas de los sistemas se indican relativas al panel. Por ejemplo, con esta estructura:

```text
Proyectos/
├── panel de pruebas/        ← este repositorio
├── sistema-escolar/         ← carpetaLocal: ..\sistema-escolar
└── punto-de-venta/          ← carpetaLocal: ..\punto-de-venta
```

> No pongas contraseñas reales en el catálogo: está pensado para usuarios de prueba de tus entornos locales.

---

## Comandos de Consola (CLI)

Puedes ejecutar cualquiera de las herramientas directamente desde PowerShell o CMD:

```powershell
# Iniciar el servidor del Panel de Pruebas en http://localhost:4500
node server.js

# Ejecutar suite automatizada de Control de Calidad (QA)
npm test

# Detectar tecnologías y actualizar la Ficha Técnica de todos los sistemas
node scripts/detector-ficha-tecnica.js

# Ejecutar auditoría de seguridad OWASP en todos los proyectos
node scripts/auditoria-seguridad.js

# Auditar un proyecto específico y exportar reporte JSON
node scripts/auditoria-seguridad.js --proyecto=sis-titulacion-cucsur --json

# Simular usuarios concurrentes (escalera progresiva hasta 200 usuarios)
node scripts/prueba-carga.js --proyecto=bistrosoft-pos --max=200
```

---

## Estructura del Proyecto

```text
panel de pruebas/
├── iniciar-panel.bat               # Lanzador directo en Windows (abre el navegador en el puerto real)
├── .gitignore                      # Evita subir credenciales y respaldos a GitHub
├── server.js                       # Punto de entrada ligero del servidor HTTP
├── package.json                    # Configuración y scripts CLI (npm start, npm test, npm run audit)
├── README.md                       # Documentación del sistema
├── src/                            # Arquitectura modular del Backend (por capas y dominios)
│   ├── config/
│   │   ├── constantes.js           # Puertos, límites, MIME types, cabeceras HTTP y CSP
│   │   └── rutas-sistema.js        # Rutas base del proyecto, datos, respaldos y directorios ignorados
│   ├── utils/
│   │   ├── archivos.js             # Prevención de Path Traversal, lectura JSON y escáner recursivo
│   │   ├── cli.js                  # Parseo de argumentos de consola y helpers asíncronos
│   │   └── urls.js                 # Validación SSRF (localhost), construcción de URLs y puertos
│   ├── services/
│   │   ├── catalogo/
│   │   │   ├── repositorio.js      # Lectura, escritura atómica, búsqueda y filtrado de proyectos
│   │   │   ├── respaldos.js        # Creación, rotación y restauración de respaldos automáticos
│   │   │   └── validacion.js       # Validación estricta del catálogo, comandos y rutas de acceso
│   │   ├── procesos/
│   │   │   ├── puertos.js          # Verificación TCP, búsqueda de puerto libre y estados por dueño
│   │   │   ├── scripts-bat.js      # Detección y sincronización de archivos .bat por proyecto
│   │   │   └── lanzador.js         # Arranque, reinicio y detención desacoplada de servidores locales
│   │   ├── deteccion/
│   │   │   ├── detector-proyecto.js# Autodetección de nombre, comando y puerto desde la carpeta
│   │   │   └── ficha-tecnica.js    # Analizador de tecnologías, esquemas SQL y métricas LOC
│   │   ├── auditoria/
│   │   │   ├── sast.js             # Análisis estático de código fuente (SQLi, XSS, secretos, exec)
│   │   │   ├── dast.js             # Análisis pasivo en vivo de cabeceras HTTP y rutas protegidas
│   │   │   ├── evaluadores.js      # Higiene de credenciales, archivos de configuración y puntaje
│   │   │   └── index.js            # Orquestador de auditoría individual y global (OWASP Top 10)
│   │   ├── carga/
│   │   │   └── prueba-carga.js     # Motor de pruebas de concurrencia y punto de colapso
│   │   └── sesion/
│   │       └── inicio-sesion.js    # Automatización de inicio de sesión por rol en Chrome/Edge
│   └── http/
│       ├── seguridad-http.js       # Protección contra DNS rebinding, CSRF y validación de cabeceras
│       ├── respuestas.js           # Lectura de body JSON con límite, respuestas JSON y semáforo
│       ├── estaticos.js            # Servidor seguro de archivos estáticos con CSP
│       ├── rutas-api.js            # Controladores de los endpoints REST (/api/*)
│       └── servidor.js             # Instancia HTTP, manejo de puertos ocupados y ciclo de vida
├── data/
│   ├── proyectos.json              # Catálogo persistente de proyectos, roles y fichas técnicas
│   └── respaldos/                  # Copias automáticas antes de cada cambio (últimas 25)
├── tools/                          # Configuración para compilar el CSS (npm run build:css)
├── scripts/                        # Ejecutables CLI y adaptadores de compatibilidad
│   ├── utils-proyectos.js          # Punto de integración de utilidades del proyecto
│   ├── inicio-sesion.js            # Adaptador del servicio de inicio de sesión automático
│   ├── detector-proyecto.js        # Adaptador del detector de datos de proyecto
│   ├── detector-ficha-tecnica.js   # CLI: Generador de fichas técnicas
│   ├── prueba-carga.js             # CLI: Simulador de usuarios concurrentes
│   └── auditoria-seguridad.js      # CLI: Auditoría defensiva SAST + DAST (OWASP Top 10)
├── tests/
│   ├── qa.test.js                  # Suite de pruebas automatizadas de calidad y seguridad
│   ├── inicio-sesion.test.js       # Pruebas del inicio de sesión automático (con Chrome oculto)
│   └── fixtures/                   # Sistemas simulados con los mismos estilos de login
└── public/                         # Aplicación Frontend (Cliente Web)
    ├── index.html                  # Panel de inicio y panel de cada sistema
    ├── css/
    │   ├── tailwind.css            # Tailwind compilado (sin depender del CDN)
    │   └── styles.css              # Estilos tipográficos, foco de teclado y animaciones suaves
    └── js/
        ├── default-data.js         # Respaldo local sincronizado automáticamente con proyectos.json
        ├── utils.js                # Helpers puros, constantes, toasts, portapapeles y formato
        ├── render.js               # Estampas del inicio, panel de cada sistema y ficha técnica
        ├── modals/                 # Submódulos especializados por cada ventana modal
        │   ├── modal-proyecto.js   # Formulario CRUD de sistemas, roles y autodetección
        │   ├── modal-auditoria.js  # Visualización y exportación de reportes OWASP
        │   ├── modal-carga.js      # Control y tabla del simulador de usuarios concurrentes
        │   └── modal-respaldos.js  # Historial y restauración de respaldos del catálogo
        ├── modals.js               # Punto de integración de modales
        ├── actions/                # Submódulos de acciones de negocio en el cliente
        │   ├── proyectos-acciones.js # Encendido, apagado, puertos, escaneo .bat y respaldos JSON
        │   └── sesion-acciones.js  # Inicio de sesión automático o con pestaña de espera
        └── app.js                  # Estado principal, enrutador hash (#/sistema/<id>) y eventos UI
```

---

## Seguridad del panel

El panel puede ejecutar scripts en tu equipo, así que se protege así:

| Riesgo | Protección |
| :--- | :--- |
| Una página web que visites intenta usar la API (CSRF) | Se rechaza cualquier `Origin` distinto del panel, las peticiones marcadas como *cross-site* y los `POST` que no sean `application/json`. |
| Un dominio externo apunta a `127.0.0.1` (DNS rebinding) | Solo se responde si el header `Host` es `localhost`/`127.0.0.1` con el puerto del panel. |
| Comandos encadenados (`&`, `|`, `>`…) en el catálogo | `validarComandoInicio` solo permite `.bat` dentro de la carpeta del proyecto o comandos de `npm`, `node`, `python`, `py`, `php`, `composer`, `yarn`, `pnpm`. |
| Pruebas de carga contra sitios externos | Todas las URLs (incluidas las rutas de cada rol) deben ser de `localhost`. |
| Pérdida del catálogo | Escritura atómica y respaldos automáticos en `data/respaldos/`. |

> Las contraseñas del catálogo se guardan en texto plano porque son credenciales de **prueba**. No pongas aquí contraseñas reales y no subas `data/` ni `public/js/default-data.js` a GitHub (ya están en `.gitignore`).
