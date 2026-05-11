# Sistema Inteligente de Viajes de Perú

Asistente conversacional especializado en viajes dentro del Perú. Permite a los viajeros consultar en tiempo real vuelos, rutas de bus, hospedaje, gastronomía, atracciones turísticas y condiciones climáticas de cualquier ciudad peruana, combinando inteligencia artificial con búsqueda web actualizada y siempre referenciada a la fecha actual.

> Desarrollado con **React 18 + Vite** en el frontend y **FastAPI + Mistral AI + Tavily** en el backend, con autenticación segura mediante **Firebase Authentication** e historial de conversaciones en **Firestore**.

---

## Funcionalidades

### Asistente inteligente
- **Consultas de transporte aéreo** — vuelos, aerolíneas (LATAM, Sky, Avianca, JetSmart, Star Perú), tarifas y conexiones.
- **Consultas de transporte terrestre** — operadores (Cruz del Sur, Oltursa, Tepsa, Civa, Móvil Tours, Flores, Ittsa), rutas, horarios y terminales.
- **Trenes y servicios turísticos** — Inca Rail, PeruRail, Andean Explorer, ruta a Machu Picchu.
- **Hospedaje** — hoteles, hostales y alojamientos con rangos de precio y alternativas por ciudad.
- **Gastronomía y transporte local** — restaurantes típicos, precios de menú, taxi, Uber y transporte urbano en destino.
- **Atracciones turísticas** — museos, plazas, ruinas, miradores y tours con costos de entrada.
- **Clima siempre presente** — cada respuesta con ciudad destino incluye automáticamente temperatura, precipitaciones y recomendaciones para la fecha de consulta o la fecha futura indicada.
- **Fecha de referencia automática** — el asistente considera siempre la fecha actual para temporadas, disponibilidad y precios vigentes.

### Interfaz de usuario
- **Historial de chats por sesión** — cada conversación se guarda en Firestore con ID basado en fecha/hora (`YYYYMMDD_HHmmss_mmm`). Se puede navegar entre chats anteriores desde el sidebar.
- **Sidebar desplegable** — panel lateral con lista de conversaciones anteriores, vista previa del texto y contador de mensajes. Se abre/cierra con el botón hamburguesa.
- **Renderizado markdown enriquecido** — tablas de precios con colores, negritas, listas, encabezados y bloques de código renderizados visualmente.
- **Chips de categoría automáticos** — cada respuesta detecta su tema principal y muestra un chip con emoji e ícono de color: ✈️ Transporte, 🏨 Hospedaje, 🍽️ Alimentación, 🗺️ Turismo, ☁️ Clima.
- **Burbujas de colores por tema** — el fondo de cada respuesta varía según la categoría detectada.
- **Fuentes web clicables** — los enlaces `[Fuente: url]` se convierten en botones navegables.
- **Búsqueda web en vivo** — Tavily obtiene información actualizada; el badge 🔍 indica cuándo se usó.
- **Diseño responsive** — adaptado a escritorio, tablet y móvil. En pantallas pequeñas el sidebar se convierte en overlay con backdrop.

### Exportación PDF — dos modos

#### Reporte Detallado (botón PDF)
Documento completo con todas las conversaciones organizadas por tema:
- **Portada** con fondo azul/dorado peruano, título del sistema, fecha, hora y usuario.
- **Secciones por tema** (solo aparecen si hay contenido relevante):
  1. ✈️ Costos de Viaje en Vuelo y Bus — Comparativas
  2. ☁️ Datos del Clima en Ciudad Destino
  3. 🏨 Costos de Hospedaje — Alternativas
  4. 🍽️ Costos de Alimentación y Transporte Local
  5. 🗺️ Lugares que Visitar y sus Costos
  6. ℹ️ Otros Datos de Interés para el Turista
- Cada Q/A aparece en **una sola sección** (primera coincidencia gana).
- **Pie de página** en cada hoja con número de página y nombre del sistema.

#### Resumen Ejecutivo (botón Resumen)
Documento condensado de **máximo 2 páginas** con la información más importante:
- Encabezado compacto con fecha y usuario.
- Prioriza: condiciones climáticas, comparativa de costos económico vs. cómodo en transporte y hospedaje, lugares destacados y consejos clave.
- Fuente y márgenes reducidos para máxima densidad de información.
- Ideal para imprimir y llevar de referencia rápida al viaje.

### Gestión y administración
- **Historial persistente** — chats guardados en la subcollection Firestore `sessions/{uid}/chats/{chat_id}`, recuperados al iniciar.
- **Auto-guardado** — cada mensaje se persiste automáticamente; al crear nuevo chat el anterior queda guardado en el sidebar.
- **Control de acceso por roles** — `assistant_user`, `viewer` y `admin` con distintos niveles de acceso.
- **Panel de administración** — los usuarios con rol `admin` acceden a una pestaña para listar todos los usuarios, asignar/cambiar roles y eliminar cuentas.
- **Perfil de usuario** — nombre, preferencias de viaje, notas y fecha del último ingreso.

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
¿Cuánto cuesta comer en un restaurante típico en Cusco? Dame opciones económicas y otras más cómodas.
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
| **FastAPI** | latest | Framework REST API |
| **Uvicorn** | latest | Servidor ASGI |
| **Mistral AI** (`mistral-large-latest`) | — | Modelo de lenguaje principal |
| **LangChain + LangChain-Mistral** | — | Orquestación del agente conversacional |
| **Tavily** | — | Búsqueda web en tiempo real |
| **Firebase Admin SDK** | — | Verificación de tokens JWT y gestión de usuarios |
| **Firestore** | — | Base de datos NoSQL (historial y perfiles) |
| **python-dotenv** | — | Gestión de variables de entorno |
| **Pydantic v2** | — | Validación de esquemas de datos |
| **Starlette** | — | Middleware y StaticFiles para SPA |

### Frontend
| Tecnología | Versión | Uso |
|---|---|---|
| **React** | 18 | Librería de interfaz de usuario |
| **Vite** | 5 | Bundler y servidor de desarrollo |
| **Firebase JS SDK** | 10 | Autenticación en el cliente |
| **jsPDF** | 2.5 | Generación de PDF en el navegador (2 modos) |
| **CSS Variables** | — | Tema peruano (rojo, dorado, azul andino) |

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
│   ├── main.py                     # Entrypoint: rutas, middleware CORS, StaticFiles SPA
│   ├── agent.py                    # Agente Mistral: prompt con fecha, clima obligatorio,
│   │                               #   extracción de fechas, búsqueda Tavily
│   ├── auth.py                     # Verificación de tokens Firebase y control de roles
│   ├── firestore_service.py        # CRUD: chats por sesión (subcollection) y perfiles
│   ├── assign_role.py              # CLI para asignar roles directamente a usuarios Firebase
│   ├── requirements.txt            # Dependencias Python
│   └── .env.example                # Plantilla de variables de entorno (sin valores reales)
│
├── frontend/                       # SPA React (Vite)
│   ├── index.html                  # Entrada Vite
│   ├── vite.config.js              # Config: proxy API en dev, optimizeDeps
│   ├── package.json
│   └── src/
│       ├── main.jsx                # Punto de entrada React
│       ├── App.jsx                 # Router: Login ↔ Chat (condicionado a auth)
│       ├── firebase.js             # Configuración Firebase (projectId, apiKey, etc.)
│       ├── index.css               # Variables CSS globales — paleta turismo Perú
│       ├── context/
│       │   └── AuthContext.jsx     # Estado global: firebaseUser, role, loading, getToken
│       ├── hooks/
│       │   └── useApi.js           # Hook apiFetch: Bearer token + retry en 401/403
│       └── components/
│           ├── Login.jsx / .css    # Pantalla de acceso (correo + Google OAuth)
│           ├── Chat.jsx  / .css    # Interfaz principal: chat, tabs, PDF export (2 modos), sidebar
│           ├── Sidebar.jsx         # Panel lateral con historial de chats por fecha/hora
│           ├── MessageBubble.jsx   # Burbuja con renderizador markdown completo +
│           │                       #   detección de sección + chip temático
│           └── AdminPanel.jsx/.css # Panel de administración de usuarios y roles
│
├── Dockerfile                      # Build multi-stage: Node (React) → Python (FastAPI)
├── railway.toml                    # Config Railway: builder Dockerfile, healthcheck /health
├── .dockerignore
└── .gitignore
```

### Estructura Firestore

```
Firestore
└── sessions/
    └── {uid}/                      # Documento por usuario
        ├── nombre, email, ...      # Perfil del usuario
        └── chats/                  # Subcollección de chats
            └── {YYYYMMDD_HHmmss_mmm}/   # Un documento por chat
                ├── preview         # Primeras palabras del primer mensaje
                ├── created_at      # Timestamp de creación
                ├── message_count   # Total de mensajes en el chat
                └── messages[]      # Array de {role, content, tokens, timestamp}
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
> El proxy de Vite redirige las llamadas API al backend en el puerto 8000.

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
Los usuarios con rol `admin` tienen acceso a la pestaña **Administración** en la interfaz donde pueden:
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
| `POST` | `/chat` | `assistant_user`, `admin` | Enviar mensaje al asistente |
| `GET` | `/chats` | `assistant_user`, `viewer`, `admin` | Listar todos los chats del usuario |
| `GET` | `/chats/{chat_id}` | `assistant_user`, `viewer`, `admin` | Obtener mensajes de un chat específico |
| `DELETE` | `/chats/{chat_id}` | `assistant_user`, `admin` | Eliminar un chat específico |
| `DELETE` | `/chats` | `assistant_user`, `admin` | Eliminar todos los chats del usuario |
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

## Licencia

MIT
