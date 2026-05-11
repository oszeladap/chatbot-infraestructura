# Asistente de Transporte Perú

Asistente inteligente especializado en transporte aéreo y terrestre dentro del Perú. Permite a los viajeros consultar en tiempo real vuelos, rutas de bus, horarios, tarifas, destinos y condiciones climáticas de cualquier ciudad peruana, combinando inteligencia artificial con búsqueda web actualizada.

> Desarrollado con **React 18 + Vite** en el frontend y **FastAPI + Mistral AI + Tavily** en el backend, con autenticación segura mediante **Firebase Authentication** e historial de conversaciones en **Firestore**.

---

## Funcionalidades principales

- **Consultas de transporte aéreo** — vuelos disponibles, aerolíneas (LATAM, Sky, Avianca, JetSmart, Star Perú), precios aproximados y conexiones entre ciudades peruanas.
- **Consultas de transporte terrestre** — operadores (Cruz del Sur, Oltursa, Tepsa, Civa, Móvil Tours, Flores, Ittsa), rutas, horarios y terminales en todo el país.
- **Información de trenes y servicios turísticos** — Inca Rail, PeruRail, Andean Explorer, ruta a Machu Picchu.
- **Clima en tiempo real** — cada búsqueda incluye automáticamente las condiciones meteorológicas del destino (por defecto Lima, fecha actual) para que el viajero tome mejores decisiones.
- **Búsqueda web en vivo** — mediante Tavily, el asistente obtiene información actualizada sobre tarifas, incidencias, noticias de transporte y estado de vías.
- **Historial de conversación** — cada usuario tiene su sesión persistida en Firestore para retomar consultas anteriores.
- **Control de acceso por roles** — `assistant_user`, `viewer` y `admin` con distintos niveles de acceso.
- **Perfil de usuario** — almacena nombre, preferencias de viaje, notas y fecha del último ingreso.

---

## Tecnologías

### Backend
| Tecnología | Uso |
|---|---|
| **Python 3.12** | Lenguaje del servidor |
| **FastAPI** | Framework REST API |
| **Uvicorn** | Servidor ASGI |
| **Mistral AI** (`mistral-large-latest`) | Modelo de lenguaje |
| **LangChain** | Orquestación del agente conversacional |
| **Tavily** | Búsqueda web en tiempo real |
| **Firebase Admin SDK** | Verificación de tokens y gestión de usuarios |
| **Firestore** | Base de datos NoSQL (historial y perfiles) |
| **python-dotenv** | Gestión de variables de entorno |
| **Pydantic** | Validación de esquemas de datos |

### Frontend
| Tecnología | Uso |
|---|---|
| **React 18** | Librería de interfaz de usuario |
| **Vite** | Bundler y servidor de desarrollo |
| **Firebase JS SDK v10** | Autenticación en el cliente |
| **CSS Modules** | Estilos por componente |

### Infraestructura
| Tecnología | Uso |
|---|---|
| **Docker** (multi-stage) | Contenedorización (Node → React build → Python) |
| **Railway** | Plataforma de despliegue en la nube |
| **GitHub** | Control de versiones y CI/CD |

---

## Estructura del proyecto

```
chatbot-infraestructura/
│
├── backend/                        # API REST (Python / FastAPI)
│   ├── main.py                     # Entrypoint, rutas y middleware
│   ├── agent.py                    # Agente Mistral + búsquedas Tavily (transporte + clima)
│   ├── auth.py                     # Verificación de tokens Firebase y control de roles
│   ├── firestore_service.py        # CRUD de historial y perfiles en Firestore
│   ├── assign_role.py              # CLI para asignar roles a usuarios
│   └── requirements.txt            # Dependencias Python
│
├── frontend/                       # SPA React (Vite)
│   ├── index.html                  # Entrada Vite
│   ├── vite.config.js              # Config Vite + proxy API en desarrollo
│   ├── package.json
│   └── src/
│       ├── main.jsx                # Punto de entrada React
│       ├── App.jsx                 # Router Login ↔ Chat
│       ├── firebase.js             # Configuración Firebase
│       ├── index.css               # Variables CSS globales
│       ├── context/
│       │   └── AuthContext.jsx     # Estado global de autenticación y rol
│       ├── hooks/
│       │   └── useApi.js           # Hook fetch con Bearer token
│       └── components/
│           ├── Login.jsx / .css    # Pantalla de acceso (correo + Google)
│           ├── Chat.jsx  / .css    # Interfaz principal del asistente
│           ├── Sidebar.jsx         # Panel lateral con historial
│           └── MessageBubble.jsx   # Burbuja de mensaje (usuario / asistente)
│
├── Dockerfile                      # Build multi-stage: React → Python
├── railway.toml                    # Configuración de despliegue Railway
├── .dockerignore
└── .gitignore
```

---

## Requisitos previos

- Python 3.12+
- Node.js 18+
- Cuenta en [Mistral AI](https://mistral.ai/) con API Key
- Cuenta en [Tavily](https://tavily.com/) con API Key
- Proyecto Firebase con **Authentication** y **Firestore** habilitados
- Archivo `service-account.json` de Firebase (Admin SDK)

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

Crea el archivo `backend/.env`:

```env
MISTRAL_API_KEY=tu_clave_mistral
TAVILY_API_KEY=tu_clave_tavily
FIREBASE_PROJECT_ID=tu_proyecto_firebase
GOOGLE_APPLICATION_CREDENTIALS=../service-account.json
```

Coloca `service-account.json` en la raíz del proyecto.

### 3. Construir el frontend

```bash
cd frontend
npm install
npm run build
```

### 4. Iniciar el servidor

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Abre `http://localhost:8000` en el navegador.

> **Desarrollo frontend con hot-reload:**
> ```bash
> cd frontend && npm run dev   # http://localhost:5173
> ```
> El proxy de Vite redirige las llamadas API al backend en el puerto 8000.

---

## Variables de entorno

| Variable | Descripción |
|---|---|
| `MISTRAL_API_KEY` | Clave de la API de Mistral AI |
| `TAVILY_API_KEY` | Clave de la API de Tavily |
| `FIREBASE_PROJECT_ID` | ID del proyecto Firebase |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta al archivo `service-account.json` (local) |
| `GOOGLE_CREDENTIALS_JSON` | Service account en Base64 (despliegue en la nube) |

---

## Despliegue en Railway

El proyecto incluye `Dockerfile` y `railway.toml` listos para Railway.

### Variables requeridas en Railway

```
MISTRAL_API_KEY
TAVILY_API_KEY
FIREBASE_PROJECT_ID
GOOGLE_CREDENTIALS_JSON   ← base64 del service-account.json
```

Para generar el valor de `GOOGLE_CREDENTIALS_JSON`:

```powershell
# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

```bash
# Linux / macOS
base64 -i service-account.json
```

**URL en producción:** `https://chatbot-transporte-peru-production.up.railway.app`

---

## Gestión de roles

Los roles se asignan manualmente desde la línea de comandos:

```bash
cd backend
python assign_role.py <uid_firebase> <rol>
```

| Rol | Permisos |
|---|---|
| `assistant_user` | Usar el chat, ver y borrar su historial, editar su perfil |
| `viewer` | Ver historial de cualquier usuario (solo lectura) |
| `admin` | Acceso al dashboard de sesiones (`/admin/sessions`) |

---

## Endpoints API

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| `GET` | `/health` | Público | Estado del servidor |
| `POST` | `/chat` | `assistant_user` | Enviar mensaje al asistente |
| `GET` | `/history` | `assistant_user`, `viewer` | Obtener historial de mensajes |
| `DELETE` | `/history` | `assistant_user` | Limpiar historial (preserva perfil) |
| `GET` | `/profile` | Todos los roles | Ver perfil del usuario |
| `PUT` | `/profile` | `assistant_user` | Actualizar nombre, preferencias, notas |
| `GET` | `/admin/sessions` | `admin` | Resumen de todas las sesiones |

La documentación interactiva está disponible en `/docs` (Swagger UI).

---

## Licencia

MIT
