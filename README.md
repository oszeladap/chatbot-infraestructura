# Sistema Inteligente de Viajes de Perú

Asistente conversacional especializado en viajes dentro del Perú. Permite a los viajeros consultar en tiempo real vuelos, rutas de bus, hospedaje, gastronomía, atracciones turísticas y condiciones climáticas de cualquier ciudad peruana, combinando inteligencia artificial con búsqueda web actualizada, galería fotográfica de destinos y reportes PDF enriquecidos.

> **Desarrollado por Oscar Zelada Pozo** · React 18 + Vite · FastAPI · Mistral AI · Tavily · Firebase · Firestore · Railway · v2.3 — Mayo 2026

---

## Funcionalidades

### Asistente inteligente con IA
- **Consultas de transporte aéreo** — vuelos, aerolíneas (LATAM, Sky, Avianca, JetSmart, Star Perú), tarifas y conexiones.
- **Consultas de transporte terrestre** — operadores (Cruz del Sur, Oltursa, Tepsa, Civa, Móvil Tours, Flores, Ittsa), rutas, horarios y terminales.
- **Trenes y servicios turísticos** — Inca Rail, PeruRail, Andean Explorer, ruta a Machu Picchu.
- **Hospedaje** — hoteles, hostales y alojamientos con rangos de precio y alternativas por ciudad.
- **Gastronomía y transporte local** — restaurantes típicos, precios de menú, taxi, Uber y transporte urbano en destino.
- **Atracciones turísticas** — museos, plazas, ruinas, miradores y tours con costos de entrada.
- **Clima siempre presente** — cada respuesta con ciudad destino incluye temperatura, precipitaciones y recomendaciones para la fecha de consulta o fecha futura indicada.
- **Fecha de referencia automática** — el asistente considera siempre la fecha actual para temporadas, disponibilidad y precios vigentes.
- **Búsqueda web en tiempo real** — Tavily recupera precios y condiciones actualizadas; el badge 🔍 indica cuándo se usó.

### Galería fotográfica de destinos
- **Imágenes automáticas en el chat** — tras cada respuesta del asistente, el sistema muestra automáticamente **hasta 6 fotografías** del destino en cuadrícula: ciudad, turismo, gastronomía y alojamiento.
- **Búsqueda dinámica con Tavily** — el backend lanza 2 búsquedas por ciudad (turismo + gastronomía/hospedaje) con `include_images=True`, descarga las imágenes de forma concurrente y las devuelve como **data URLs en Base64**; el navegador nunca realiza peticiones externas de imágenes (cero problemas CORS).
- **Detección inteligente del destino** — el sistema analiza la conversación completa en 3 pasos: (1) patrones directos del usuario como "viajar a Cusco", (2) ciudad más mencionada en las respuestas del asistente, (3) primera ciudad encontrada como respaldo.
- **Cualquier ciudad del Perú** soportada sin configuración adicional — no hay listas estáticas; las imágenes son siempre actuales.
- **Caché en memoria de 24 horas** — primera consulta por ciudad ~8-14 s; consultas subsiguientes ~1-2 s.

### Interfaz de usuario
- **Historial de chats por sesión** — cada conversación se guarda en Firestore con ID basado en fecha/hora (`YYYYMMDD_HHmmss_mmm`). Se puede navegar entre chats anteriores desde el sidebar.
- **Sidebar desplegable** — panel lateral con lista de conversaciones anteriores, vista previa del texto y contador de mensajes.
- **Renderizado markdown enriquecido** — tablas de precios con colores, negritas, listas, encabezados y bloques de código renderizados visualmente.
- **Chips de categoría automáticos** — cada respuesta detecta su tema principal y muestra un chip con emoji e ícono de color: ✈️ Transporte, 🏨 Hospedaje, 🍽️ Alimentación, 🗺️ Turismo, ☁️ Clima.
- **Fuentes web clicables** — los enlaces `[Fuente: url]` se convierten en botones navegables.
- **Diseño responsive** — adaptado a escritorio, tablet y móvil con `100svh` para iOS Safari.
- **Modal Acerca de** — botón ℹ en la cabecera muestra créditos del desarrollador, tecnologías usadas y descripción del sistema.

### Exportación PDF — dos modos

#### Reporte Detallado (botón **PDF**)
Documento completo con todas las conversaciones organizadas por tema. El botón muestra **"Generando…"** durante el proceso y queda deshabilitado para evitar clics dobles. Si ocurre algún error se muestra un mensaje descriptivo.

- **Nombre de archivo inteligente**: `Detalle_viaje_<origen>_<destino>_<fecha>.pdf`
  - **Origen** obtenido por geolocalización del navegador (Nominatim reverse geocoding).
  - **Destino** detectado de la conversación completa (patrones directos del usuario → ciudad más mencionada por el asistente → fallback).
- **Portada** con fondo azul/dorado peruano, título del sistema, fecha, hora y usuario.
- **Secciones por tema** (solo aparecen si hay contenido relevante):
  1. ✈️ Costos de Viaje en Vuelo y Bus — Comparativas
  2. ☁️ Datos del Clima en Ciudad Destino
  3. 🏨 Costos de Hospedaje — Alternativas
  4. 🍽️ Costos de Alimentación y Transporte Local
  5. 🗺️ Lugares que Visitar y sus Costos
  6. ℹ️ Otros Datos de Interés para el Turista
- **Galería fotográfica**: hasta 6 fotos del destino (ciudad, turismo, gastronomía, hospedaje) obtenidas dinámicamente vía Tavily y servidas como Base64 desde el backend — compatibles con jsPDF sin restricciones CORS.
- **Sección de ruta — CÓMO LLEGAR** (solo para el destino del viaje):
  - Punto de inicio: **Plaza de Armas de la ciudad destino** (no de la ciudad de origen).
  - **Diagrama visual tipo mapa**: fondo beige estilo OSM, cuadrícula de calles, arco parabólico azul del punto A al B, marcadores circulares con letras.
  - **Barra de tiempos**: distancia y duración a pie y en vehículo calculadas con OSRM (timeout 9 s para evitar bloqueos).
  - **Pasos a pie**: instrucciones paso a paso junto al diagrama.
  - **2 botones clickeables** que abren Google Maps:
    - 🚶 Ruta a pie en Google Maps
    - 🚗 Ruta en vehículo en Google Maps
- Cada Q/A aparece en **una sola sección** (primera coincidencia gana — sin duplicados).
- **Pie de página** en cada hoja con número de página y nombre del sistema.

#### Resumen Ejecutivo (botón **Resumen ✓**)
Documento condensado de **máximo 2 páginas** generado por IA (Mistral AI). El botón muestra **"Generando…"** mientras procesa y cualquier error es notificado al usuario.

- **Pre-generado automáticamente** tras cada respuesta del asistente — el botón muestra `✓` cuando el resumen está listo en caché y la descarga es **instantánea** (sin espera).
- **Nombre de archivo inteligente**: `Resumen_viaje_<origen>_<destino>_<fecha>.pdf`.
- **Imágenes dinámicas de la ciudad destino** obtenidas vía Tavily y servidas en Base64 desde el backend, siempre actuales y sin problemas CORS.
- Estructura visual escaneable en una sola vista:
  - Franja de destino destacada (fondo azul oscuro, texto dorado).
  - **Columna izquierda**: Condiciones climáticas — temperatura, descripción, recomendación de ropa.
  - **Columna derecha**: Lugares sugeridos del destino.
  - **Tabla de costos**: Transporte, Hospedaje, Alimentación y Tours — opción económica vs. cómoda en S/.
  - **Sección de consejos**: recomendaciones prácticas para el viajero.
- La IA (Mistral AI con `temperature=0.1`) completa automáticamente secciones con conocimiento general del destino cuando la conversación no las cubre explícitamente.
- Ideal para imprimir y llevar de referencia rápida durante el viaje.

### Gestión y administración
- **Historial persistente** — chats guardados en la subcollection Firestore `sessions/{uid}/chats/{chat_id}`.
- **Auto-guardado** — cada mensaje se persiste automáticamente; al crear nuevo chat el anterior queda guardado en el sidebar.
- **Control de acceso por roles** — `assistant_user`, `viewer` y `admin` con distintos niveles de acceso.
- **Panel de administración** — los usuarios con rol `admin` acceden a la pestaña para listar todos los usuarios, asignar/cambiar roles y eliminar cuentas.
- **Registro con nombre** — el formulario de creación de cuenta solicita nombre completo; se persiste en Firebase Auth (`displayName`) y en Firestore.
- **Perfil de usuario** — nombre, preferencias de viaje, notas y fecha del último ingreso.
- **Geolocalización** — el navegador solicita permiso de ubicación al iniciar para determinar la ciudad de origen y usarla en el nombre del archivo PDF.

---

## Ejemplos de preguntas

Estas son las formas recomendadas para obtener respuestas completas y bien estructuradas del asistente:

### Transporte aéreo
```
¿Cuáles son los vuelos de Lima a Cusco este fin de semana? ¿Cuánto cuestan en LATAM y Sky?
¿Hay vuelos directos de Lima a Iquitos? ¿Cuál es la aerolínea más económica?
¿Cuánto cuesta un vuelo Lima-Arequipa para el próximo mes? Compara las opciones disponibles.
```

### Transporte terrestre
```
¿Cuánto cuesta el bus de Lima a Arequipa con Cruz del Sur? ¿Y con Oltursa o Tepsa?
¿Cómo llego de Cusco a Puno en bus? ¿Cuánto tiempo tarda y cuánto cuesta?
¿Cuál es la diferencia de precio entre el bus económico y el bus cama de Lima a Trujillo?
```

### Hospedaje
```
¿Cuánto cuesta un hostal económico en el centro de Cusco? ¿Y un hotel 4 estrellas?
Busca opciones de alojamiento en Miraflores, Lima, desde lo más económico hasta hoteles de lujo.
¿Hay alojamientos cerca de Machu Picchu? ¿Cuáles son los precios en Aguas Calientes?
```

### Gastronomía y costos locales
```
¿Qué restaurantes económicos hay en Miraflores? ¿Cuánto sale el menú del día?
¿Cuánto cuesta comer en un restaurante típico en Cusco? Dame opciones económicas y más cómodas.
¿Cuánto cobran los taxis en Lima del aeropuerto al centro? ¿Y Uber?
```

### Atracciones turísticas
```
¿Cuáles son los mejores lugares para visitar en Cusco y cuánto cuesta la entrada?
¿Cuánto vale el boleto turístico de Cusco? ¿Qué lugares incluye?
¿Qué tours hay disponibles en Arequipa? ¿Cuánto cuesta el tour al Colca?
```

### Clima
```
¿Cómo está el clima en Cusco en julio? ¿Hace mucho frío? ¿Llueve?
¿Cuál es la mejor época para visitar Machu Picchu? ¿Qué temperatura hace?
¿Cómo es el clima en Lima en diciembre? ¿Es buen momento para ir a la playa?
```

### Preguntas combinadas (mejor resultado)
```
Voy a viajar de Lima a Cusco el próximo mes. ¿Cuánto me costaría el vuelo, un hostal económico
y las entradas a Machu Picchu? Incluye el clima esperado.

Quiero comparar: ¿cuánto gastaría en un viaje de 3 días a Arequipa de forma económica vs. cómoda?
Incluye transporte, hospedaje, comida y tour al Cañón del Colca.

¿Qué debo saber antes de viajar a Cusco? Consejos sobre el soroche, documentos necesarios,
cambio de moneda y seguridad.
```

---

## Tecnologías

### Backend
| Tecnología | Versión | Uso |
|---|---|---|
| **Python** | 3.12 | Lenguaje del servidor |
| **FastAPI** | 0.115 | Framework REST API |
| **Uvicorn** | 0.30 | Servidor ASGI |
| **Mistral AI** (`mistral-large-latest`) | — | LLM principal + extracción estructurada para PDF resumen |
| **LangChain + LangChain-Mistral** | 0.3 | Orquestación del agente conversacional |
| **Tavily** | 0.3 | Búsqueda web en tiempo real + búsqueda dinámica de imágenes por destino |
| **httpx** | 0.27 | Descarga concurrente de imágenes server-side como Base64 (sin CORS) |
| **Firebase Admin SDK** | 6.5 | Verificación de tokens JWT y gestión de usuarios |
| **Firestore** | — | Base de datos NoSQL (historial y perfiles) |
| **python-dotenv** | 1.0 | Gestión de variables de entorno |
| **Pydantic v2** | 2.8 | Validación de esquemas de datos |
| **Starlette** | — | Middleware y StaticFiles para SPA |

### Frontend
| Tecnología | Versión | Uso |
|---|---|---|
| **React** | 18 | Librería de interfaz de usuario |
| **Vite** | 5 | Bundler y servidor de desarrollo |
| **Firebase JS SDK** | 10 | Autenticación en el cliente (Google + Email/Password) |
| **jsPDF** | 2.5 | Generación de PDF en el navegador (2 modos: Detallado y Resumen) |
| **Nominatim (OpenStreetMap)** | — | Geocodificación inversa (ciudad del usuario) y búsqueda de coordenadas |
| **OSRM** | — | Cálculo de rutas a pie y en vehículo (Open Source Routing Machine) |
| **Tavily Image Search** | — | Imágenes dinámicas de destinos (via backend, Base64 data URLs) |
| **CSS Variables** | — | Tema turismo Perú (rojo, dorado, azul andino) |

### Infraestructura
| Tecnología | Uso |
|---|---|
| **Docker** (multi-stage) | Build Node → React → Python en imagen única |
| **Railway** | Plataforma de despliegue en la nube |
| **GitHub** | Control de versiones y CI/CD automático |
| **Firebase Authentication** | Login con Google y correo/contraseña |
| **Firestore** | Persistencia de datos sin servidor |

---

## Estructura del proyecto

```
chatbot-infraestructura/
│
├── backend/                        # API REST (Python / FastAPI)
│   ├── main.py                     # Entrypoint: rutas, CORS, StaticFiles SPA,
│   │                               #   endpoint /images/{destination} (Tavily + Base64),
│   │                               #   mapa de rutas (staticmap + OSRM + Nominatim)
│   ├── agent.py                    # Agente Mistral: prompt, búsqueda Tavily,
│   │                               #   generate_summary() para PDF resumen
│   ├── auth.py                     # Verificación de tokens Firebase y control de roles
│   ├── firestore_service.py        # CRUD: chats por sesión (subcollection) y perfiles
│   ├── assign_role.py              # CLI para asignar roles directamente a usuarios Firebase
│   ├── requirements.txt            # Dependencias Python
│   └── .env.example                # Plantilla de variables de entorno (sin valores reales)
│
├── frontend/                       # SPA React (Vite)
│   ├── index.html                  # Entrada Vite
│   ├── vite.config.js              # Config: proxy API en dev (/chat, /images, /summary…)
│   ├── package.json
│   └── src/
│       ├── main.jsx                # Punto de entrada React
│       ├── App.jsx                 # Router: Login ↔ Chat (condicionado a auth)
│       ├── firebase.js             # Configuración Firebase
│       ├── index.css               # Variables CSS globales — paleta turismo Perú
│       ├── context/
│       │   └── AuthContext.jsx     # Estado global: firebaseUser, role, loading
│       ├── hooks/
│       │   └── useApi.js           # Hook apiFetch: Bearer token + retry en 401/403
│       └── components/
│           ├── Login.jsx / .css    # Pantalla de acceso: Google OAuth + Email/Password
│           │                       #   (registro incluye campo Nombre completo)
│           ├── Chat.jsx  / .css    # Interfaz principal: chat, galería de imágenes,
│           │                       #   sidebar, PDF detallado y resumen ejecutivo,
│           │                       #   geolocalización, modal Acerca de
│           ├── Sidebar.jsx         # Panel lateral con historial de chats por fecha/hora
│           ├── MessageBubble.jsx   # Burbuja con markdown, chips temáticos
│           │                       #   y galería fotográfica del destino (4 imágenes, 2×2)
│           └── AdminPanel.jsx/.css # Panel de administración de usuarios y roles
│
├── CASO_DE_USO.md                  # Documentación UML 2.5 / IEEE 830 / RUP
│                                   #   15 casos de uso, 27 RF, 29 RNF, 12 reglas de negocio
├── Dockerfile                      # Build multi-stage: Node (React) → Python (FastAPI)
├── railway.toml                    # Config Railway: builder Dockerfile, healthcheck /health
├── .dockerignore
└── .gitignore
```

### Estructura Firestore

```
Firestore
└── sessions/
    └── {uid}/                          # Documento por usuario
        ├── cliente_id, nombre, email   # Perfil del usuario
        ├── preferencias[]              # Lista de preferencias de viaje
        ├── notas                       # Notas libres
        ├── fecha_ultimo_ingreso        # Timestamp ISO
        └── chats/                      # Subcollección de chats
            └── {YYYYMMDD_HHmmss_mmm}/ # Un documento por conversación
                ├── preview             # Primeras palabras del primer mensaje
                ├── created_at          # Timestamp de creación
                ├── message_count       # Total de mensajes en el chat
                └── messages[]          # Array de {role, content, tokens, timestamp}
```

---

## Requisitos previos

- Python 3.12+
- Node.js 18+
- Cuenta en [Mistral AI](https://mistral.ai/) con API Key activa
- Cuenta en [Tavily](https://tavily.com/) con API Key activa
- Proyecto Firebase con **Authentication** (Google + Email/Password) y **Firestore** habilitados
- Archivo `service-account.json` de Firebase (Admin SDK) en la raíz del proyecto

---

## Instalación y ejecución local

### 1. Clonar el repositorio

```bash
git clone https://github.com/oszeladap/chatbot-infraestructura.git
cd chatbot-infraestructura
```

### 2. Configurar el backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
```

Crea el archivo `backend/.env` (copia de `.env.example` con tus claves reales):

```env
MISTRAL_API_KEY=tu_clave_mistral
TAVILY_API_KEY=tu_clave_tavily
FIREBASE_PROJECT_ID=tu_proyecto_firebase
GOOGLE_APPLICATION_CREDENTIALS=../service-account.json
```

Coloca `service-account.json` en la **raíz del proyecto** (un nivel arriba de `backend/`).

### 3. Construir el frontend

```bash
cd frontend
npm install
npm run build
```

### 4. Iniciar el servidor

```bash
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000
```

Abre `http://localhost:8000` en el navegador.

> **Desarrollo frontend con hot-reload:**
> ```bash
> cd frontend && npm run dev   # → http://localhost:5173
> ```
> El proxy de Vite redirige automáticamente `/chat`, `/chats`, `/images`, `/summary`, etc. al backend en el puerto 8000.

---

## Variables de entorno

| Variable | Dónde se usa | Descripción |
|---|---|---|
| `MISTRAL_API_KEY` | Backend | Clave de la API de Mistral AI |
| `TAVILY_API_KEY` | Backend | Clave de la API de Tavily (búsqueda web) |
| `FIREBASE_PROJECT_ID` | Backend | ID del proyecto Firebase |
| `GOOGLE_APPLICATION_CREDENTIALS` | Backend (local) | Ruta al archivo `service-account.json` |
| `GOOGLE_CREDENTIALS_JSON` | Backend (Railway/Docker) | Service account codificado en Base64 |

---

## Despliegue en Railway

El repositorio incluye `Dockerfile` y `railway.toml` listos. Railway detecta automáticamente el Dockerfile y realiza el build multi-stage.

### Variables requeridas en Railway

Configura estas variables en el panel de Railway → **Variables**:

```
MISTRAL_API_KEY        → tu clave Mistral
TAVILY_API_KEY         → tu clave Tavily
FIREBASE_PROJECT_ID    → ID del proyecto Firebase
GOOGLE_CREDENTIALS_JSON → service-account.json en Base64 (ver abajo)
```

Para generar `GOOGLE_CREDENTIALS_JSON`:

```powershell
# PowerShell (Windows)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

```bash
# Linux / macOS
base64 -w 0 service-account.json
```

Cada `git push` a la rama `main` dispara automáticamente un nuevo despliegue en Railway.

**URL en producción:** `https://chatbot-transporte-peru-production.up.railway.app`

---

## Gestión de roles

### Desde el Panel de Administración (recomendado)
Los usuarios con rol `admin` tienen acceso a la pestaña **Administración** donde pueden:
- Ver todos los usuarios registrados con su rol actual.
- Asignar o cambiar roles (`assistant_user`, `viewer`, `admin`) mediante un desplegable.
- Eliminar cuentas de usuario permanentemente.

### Desde la línea de comandos (alternativa)

```bash
cd backend
python assign_role.py <uid_firebase> <rol>
# Ejemplo:
python assign_role.py abc123uid assistant_user
```

### Tabla de permisos

| Rol | Chat | Historial | Perfil | Admin |
|---|---|---|---|---|
| `assistant_user` | Enviar y recibir | Ver y borrar el propio | Ver y editar | No |
| `viewer` | No | Ver cualquier usuario | Ver | No |
| `admin` | Enviar y recibir | Ver cualquier usuario | Ver y editar | Completo |

---

## Endpoints API

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| `GET` | `/health` | Público | Estado del servidor |
| `GET` | `/images/{destination}` | Público | Búsqueda dinámica de imágenes via Tavily + descarga Base64 (24 h caché) |
| `POST` | `/chat` | `assistant_user`, `admin` | Enviar mensaje al asistente IA |
| `GET` | `/chats` | `assistant_user`, `viewer`, `admin` | Listar todos los chats del usuario |
| `GET` | `/chats/{chat_id}` | `assistant_user`, `viewer`, `admin` | Obtener mensajes de un chat específico |
| `DELETE` | `/chats/{chat_id}` | `assistant_user`, `admin` | Eliminar un chat específico |
| `DELETE` | `/chats` | `assistant_user`, `admin` | Eliminar todos los chats del usuario |
| `POST` | `/summary` | `assistant_user`, `admin` | Generar resumen estructurado IA para PDF ejecutivo |
| `GET` | `/history` | `assistant_user`, `viewer`, `admin` | Historial plano (legacy) |
| `DELETE` | `/history` | `assistant_user`, `admin` | Limpiar historial (preserva perfil) |
| `GET` | `/profile` | Todos los roles | Ver perfil propio |
| `PUT` | `/profile` | `assistant_user`, `admin` | Actualizar perfil |
| `GET` | `/admin/sessions` | `admin` | Resumen de todas las sesiones |
| `GET` | `/admin/users` | `admin` | Listar todos los usuarios Firebase |
| `PUT` | `/admin/users/{uid}/role` | `admin` | Asignar o quitar rol a un usuario |
| `DELETE` | `/admin/users/{uid}` | `admin` | Eliminar usuario permanentemente |

La documentación interactiva Swagger está disponible en `/docs`.

---

## Créditos

| | |
|---|---|
| **Desarrollador** | Oscar Zelada Pozo |
| **Versión** | 2.3 — Mayo 2026 |
| **Stack principal** | React 18 · FastAPI · Mistral AI · Tavily · Firebase · Firestore · Railway |
| **Imágenes** | Tavily Image Search — búsqueda dinámica, descarga Base64 server-side |
| **Mapas y rutas** | OpenStreetMap (Nominatim) + OSRM — datos © OpenStreetMap contributors |
| **Documentación técnica** | `CASO_DE_USO.md` — estándar UML 2.5 / IEEE 830 / RUP |

---

## Licencia

MIT
