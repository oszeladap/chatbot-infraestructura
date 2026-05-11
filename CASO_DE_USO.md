# CASO DE USO — SISTEMA INTELIGENTE DE VIAJES DE PERÚ

---

## CONTROL DE DOCUMENTO

| Campo | Detalle |
|---|---|
| **Proyecto** | Sistema Inteligente de Viajes de Perú |
| **Documento** | Especificación de Casos de Uso |
| **Versión** | 1.0 |
| **Fecha** | Mayo 2026 |
| **Estado** | Aprobado |
| **Metodología** | UML 2.5 — IEEE 830 — RUP (Rational Unified Process) |
| **Clasificación** | Uso interno / Documentación técnica |

---

## TABLA DE CONTENIDO

1. [Introducción](#1-introducción)
2. [Descripción General del Sistema](#2-descripción-general-del-sistema)
3. [Actores del Sistema](#3-actores-del-sistema)
4. [Diagrama de Casos de Uso](#4-diagrama-de-casos-de-uso)
5. [Especificación Detallada de Casos de Uso](#5-especificación-detallada-de-casos-de-uso)
6. [Requerimientos Funcionales](#6-requerimientos-funcionales)
7. [Requerimientos No Funcionales](#7-requerimientos-no-funcionales)
8. [Reglas de Negocio](#8-reglas-de-negocio)
9. [Glosario](#9-glosario)

---

## 1. INTRODUCCIÓN

### 1.1 Propósito

Este documento especifica los casos de uso del **Sistema Inteligente de Viajes de Perú**, describiendo las interacciones funcionales entre los actores del sistema y las funcionalidades ofrecidas. Sirve como contrato técnico entre las partes interesadas, referencia para desarrollo, pruebas y mantenimiento, y guía de evaluación de la cobertura funcional.

### 1.2 Alcance

El sistema es un asistente conversacional impulsado por inteligencia artificial que provee información actualizada sobre viajes dentro del territorio peruano. Cubre:

- Transporte aéreo y terrestre con comparativas de precios
- Opciones de hospedaje por categoría
- Gastronomía típica y transporte local en destino
- Atracciones turísticas, museos, ruinas y tours
- Condiciones climáticas en tiempo real y por temporada
- Exportación de reportes PDF en dos modalidades
- Gestión de historial de conversaciones por sesión
- Panel de administración de usuarios y roles

El sistema **no** cubre reservas de vuelos ni pagos en línea. Es un sistema de información y asesoramiento.

### 1.3 Audiencia del Documento

| Audiencia | Propósito |
|---|---|
| Turistas / Usuarios finales | Comprender las funcionalidades disponibles |
| Equipo de desarrollo | Referencia de implementación y pruebas |
| Administradores del sistema | Gestión de accesos y roles |
| Analistas de negocio | Validación de cobertura funcional |
| Evaluadores / QA | Base para diseño de casos de prueba |

### 1.4 Definiciones y Acrónimos

| Término | Definición |
|---|---|
| **IA** | Inteligencia Artificial |
| **LLM** | Large Language Model — modelo de lenguaje de gran escala |
| **Mistral AI** | Proveedor del modelo de lenguaje `mistral-large-latest` utilizado como motor de respuesta |
| **Tavily** | Motor de búsqueda web en tiempo real integrado al sistema |
| **Firebase Auth** | Servicio de autenticación de Google Firebase |
| **Firestore** | Base de datos NoSQL en la nube de Google Firebase |
| **JWT** | JSON Web Token — token de autenticación firmado |
| **Chat** | Sesión de conversación identificada por un ID único basado en fecha/hora (`YYYYMMDD_HHmmss_mmm`) |
| **PDF Detallado** | Reporte completo con todas las respuestas organizadas por sección temática |
| **Resumen Ejecutivo** | Reporte condensado generado por IA con estructura visual: clima, lugares, costos comparativos |
| **Rol** | Nivel de acceso asignado a un usuario: `assistant_user`, `viewer` o `admin` |
| **API REST** | Interfaz de programación de aplicaciones basada en protocolo HTTP/JSON |
| **SPA** | Single Page Application — aplicación web de una sola página |
| **RNF** | Requerimiento No Funcional |
| **RF** | Requerimiento Funcional |
| **CU** | Caso de Uso |

---

## 2. DESCRIPCIÓN GENERAL DEL SISTEMA

### 2.1 Contexto

El Sistema Inteligente de Viajes de Perú es una plataforma web orientada a turistas nacionales e internacionales que planifican o realizan viajes dentro del Perú. El sistema combina un modelo de lenguaje avanzado (Mistral AI) con búsqueda web en tiempo real (Tavily) para proveer información actualizada, comparativa y personalizada sobre todos los aspectos del viaje.

### 2.2 Arquitectura General

```
┌──────────────────────────────────────────────────────────────────────┐
│                        USUARIO / TURISTA                              │
│                    (Navegador Web / Móvil)                            │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼─────────────────────────────────────────┐
│                     FRONTEND — React 18 + Vite                        │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌──────────────────────┐ │
│  │  Login   │ │   Chat   │ │   Sidebar   │ │   PDF Export (jsPDF) │ │
│  │ Firebase │ │ Bubbles  │ │  Historial  │ │  Detallado / Resumen │ │
│  └──────────┘ └──────────┘ └─────────────┘ └──────────────────────┘ │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ API REST (Bearer JWT)
┌────────────────────────────▼─────────────────────────────────────────┐
│                   BACKEND — FastAPI + Python 3.12                     │
│  ┌───────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │  auth.py  │ │   main.py   │ │   agent.py   │ │firestore_svc  │  │
│  │ Firebase  │ │ Rutas REST  │ │ Mistral+Tav. │ │  CRUD chats   │  │
│  │ JWT check │ │ + Roles     │ │ run_agent()  │ │  + perfiles   │  │
│  │ + Roles   │ │             │ │ gen_summary()│ │               │  │
│  └───────────┘ └──────────────┘ └──────────────┘ └───────────────┘  │
└───────────────────┬───────────────────┬──────────────────────────────┘
                    │                   │
        ┌───────────▼────┐   ┌──────────▼──────────┐
        │  Mistral AI    │   │  Google Firestore   │
        │ (LLM + Summary)│   │  sessions/{uid}/    │
        └───────┬────────┘   │  chats/{chat_id}    │
                │            └─────────────────────┘
        ┌───────▼────────┐
        │  Tavily Search │
        │ (Web en tiempo │
        │    real)       │
        └────────────────┘
```

### 2.3 Capacidades Principales del Sistema

| Capacidad | Descripción |
|---|---|
| **Consulta conversacional** | El usuario interactúa mediante lenguaje natural; el sistema responde con información estructurada en markdown |
| **Búsqueda web en tiempo real** | Tavily obtiene datos actualizados de transporte, precios y clima cuando la consulta lo requiere |
| **Memoria de conversación** | Cada chat mantiene su historial para dar respuestas con contexto |
| **Persistencia en la nube** | Firestore almacena chats y perfiles de forma permanente y segura |
| **Exportación PDF profesional** | Dos modalidades de reporte: detallado por secciones y resumen ejecutivo generado por IA |
| **Control de acceso por roles** | Tres niveles de acceso con permisos diferenciados |
| **Panel de administración** | Gestión completa de usuarios desde la interfaz |

---

## 3. ACTORES DEL SISTEMA

### 3.1 Actores Principales (Humanos)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACTORES DEL SISTEMA                           │
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │  TURISTA /  │    │VISUALIZADOR │    │  ADMINISTRADOR      │  │
│  │  USUARIO    │    │  (viewer)   │    │    (admin)          │  │
│  │(assistant_  │    │             │    │                     │  │
│  │   user)     │    │             │    │                     │  │
│  │             │    │             │    │                     │  │
│  │ • Chat      │    │ • Ver       │    │ • Todo lo de        │  │
│  │ • PDF       │    │   historial │    │   assistant_user    │  │
│  │ • Historial │    │ • Ver perfil│    │ • Gestionar usuarios│  │
│  │ • Perfil    │    │             │    │ • Asignar roles     │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

| Actor | Rol en Sistema | Descripción |
|---|---|---|
| **Turista / Usuario** | `assistant_user` | Actor primario. Turista nacional o internacional que planifica o realiza un viaje en Perú. Puede enviar consultas, ver historial propio, exportar PDFs y editar su perfil. |
| **Visualizador** | `viewer` | Actor secundario con acceso de solo lectura. Puede consultar el historial de cualquier usuario pero no puede enviar mensajes ni modificar datos. |
| **Administrador** | `admin` | Actor con privilegios totales. Gestiona usuarios, asigna roles, elimina cuentas y tiene acceso a todas las funcionalidades del sistema. |

### 3.2 Actores Secundarios (Sistemas Externos)

| Actor | Tipo | Descripción |
|---|---|---|
| **Mistral AI** | Sistema externo | LLM que procesa las consultas y genera respuestas estructuradas en markdown. Modelo: `mistral-large-latest`. |
| **Tavily Search** | Sistema externo | Motor de búsqueda web en tiempo real. Provee snippets actualizados de transporte, precios y clima. |
| **Firebase Authentication** | Sistema externo | Servicio de autenticación. Valida tokens JWT y gestiona custom claims (roles). |
| **Google Firestore** | Sistema externo | Base de datos NoSQL. Almacena perfiles de usuario, historial de chats y metadatos de sesión. |

### 3.3 Matriz de Permisos por Rol

| Funcionalidad | `assistant_user` | `viewer` | `admin` |
|---|:---:|:---:|:---:|
| Enviar consulta al asistente | ✅ | ❌ | ✅ |
| Ver historial propio | ✅ | ✅ | ✅ |
| Ver historial de otros usuarios | ❌ | ✅ | ✅ |
| Exportar PDF | ✅ | ❌ | ✅ |
| Borrar historial propio | ✅ | ❌ | ✅ |
| Editar perfil | ✅ | ❌ | ✅ |
| Ver perfil | ✅ | ✅ | ✅ |
| Gestionar usuarios | ❌ | ❌ | ✅ |
| Asignar/cambiar roles | ❌ | ❌ | ✅ |
| Eliminar usuarios | ❌ | ❌ | ✅ |
| Ver panel de administración | ❌ | ❌ | ✅ |

---

## 4. DIAGRAMA DE CASOS DE USO

```
╔══════════════════════════════════════════════════════════════════════════╗
║              SISTEMA INTELIGENTE DE VIAJES DE PERÚ                       ║
║                                                                           ║
║  ┌──────────────────────────────────────────────────────────────────┐    ║
║  │                    MÓDULO DE ACCESO                               │    ║
║  │  (CU-01) Autenticarse en el sistema                               │    ║
║  │  (CU-13) Cerrar sesión                                            │    ║
║  └──────────────────────────────────────────────────────────────────┘    ║
║                                                                           ║
║  ┌──────────────────────────────────────────────────────────────────┐    ║
║  │                 MÓDULO DE CONSULTA TURÍSTICA                      │    ║
║  │  (CU-02) Consultar transporte aéreo                               │◄──╗║
║  │  (CU-03) Consultar transporte terrestre                           │   ║║
║  │  (CU-04) Consultar hospedaje                                      │ T ║║
║  │  (CU-05) Consultar gastronomía y transporte local                 │ U ║║
║  │  (CU-06) Consultar atracciones turísticas                         │ R ║║
║  │  (CU-07) Consultar condiciones climáticas                         │ I ║║
║  └──────────────────────────────────────────────────────────────────┘ S ║║
║                         <<include>>                                   T ║║
║                ┌──────────────────────────────────────────────────┐  A ║║
║                │         (CU-08) Generar respuesta con IA          │  / ║║
║                │  <<Mistral AI + Tavily Search>>                   │  U ║║
║                └──────────────────────────────────────────────────┘  S ║║
║                                                                       U ║║
║  ┌──────────────────────────────────────────────────────────────────┐ A ║║
║  │                   MÓDULO DE REPORTES PDF                          │ R ║║
║  │  (CU-09) Exportar reporte PDF detallado                           │ I ║║
║  │  (CU-10) Exportar resumen ejecutivo PDF (IA)                      │ O ╔╝║
║  └──────────────────────────────────────────────────────────────────┘ ╚═╝║
║                                                                           ║
║  ┌──────────────────────────────────────────────────────────────────┐    ║
║  │                MÓDULO DE HISTORIAL Y PERFIL                       │    ║
║  │  (CU-11) Gestionar historial de chats                             │◄── TURISTA║
║  │  (CU-12) Gestionar perfil de usuario                              │◄── ADMIN  ║
║  └──────────────────────────────────────────────────────────────────┘    ║
║                                                                           ║
║  ┌──────────────────────────────────────────────────────────────────┐    ║
║  │                 MÓDULO DE ADMINISTRACIÓN                          │    ║
║  │  (CU-14) Administrar usuarios y roles                             │◄── ADMIN  ║
║  │  (CU-15) Ver sesiones activas del sistema                         │◄── ADMIN  ║
║  └──────────────────────────────────────────────────────────────────┘    ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## 5. ESPECIFICACIÓN DETALLADA DE CASOS DE USO

> **Plantilla estándar aplicada** — Basada en IEEE 830, UML 2.5 y metodología RUP.

---

### CU-01 — Autenticarse en el Sistema

| Campo | Detalle |
|---|---|
| **Identificador** | CU-01 |
| **Nombre** | Autenticarse en el sistema |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Visualizador, Administrador, Firebase Authentication |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Muy alta — cada inicio de sesión |
| **Requerimientos asociados** | RF-01, RF-02, RNF-03, RNF-04 |

**Descripción breve:** El usuario accede al sistema proporcionando sus credenciales mediante correo electrónico/contraseña o cuenta de Google. El sistema verifica la identidad a través de Firebase Authentication, obtiene el rol asociado y redirige al usuario a la interfaz principal.

**Precondiciones:**
- El usuario dispone de una cuenta registrada en Firebase Authentication.
- El administrador ha asignado un rol válido (`assistant_user`, `viewer` o `admin`).
- El servicio de Firebase Authentication está operativo.

**Postcondiciones:**
- El usuario accede a la interfaz principal con las funcionalidades correspondientes a su rol.
- Se genera un JWT (token de sesión) válido con los custom claims del rol.
- Se actualiza el campo `fecha_ultimo_ingreso` en Firestore.

**Flujo básico:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Usuario | Accede a la URL del sistema |
| 2 | Sistema | Muestra la pantalla de inicio de sesión |
| 3 | Usuario | Selecciona método: "Correo/Contraseña" o "Google" |
| 4 | Firebase Auth | Valida las credenciales proporcionadas |
| 5 | Firebase Auth | Devuelve un JWT con UID y custom claims (rol) |
| 6 | Sistema | Verifica el token y extrae el rol del usuario |
| 7 | Sistema | Actualiza `fecha_ultimo_ingreso` en Firestore |
| 8 | Sistema | Redirige al usuario a la interfaz de chat |

**Flujos alternativos:**

- **FA-01 — Login con Google OAuth:** En el paso 3, el usuario selecciona "Google". Firebase OAuth redirige al selector de cuenta Google. Al completar, fluye desde el paso 5.
- **FA-02 — Sin rol asignado:** Si en el paso 6 el rol es `null`, el sistema muestra mensaje de "Acceso sin rol" y restringe las funcionalidades hasta que un administrador asigne un rol.

**Flujos de excepción:**

- **FE-01 — Credenciales incorrectas:** Firebase retorna error. El sistema muestra mensaje "Usuario o contraseña incorrectos".
- **FE-02 — Token expirado:** Si el JWT expira durante la sesión, el sistema solicita re-autenticación automáticamente.
- **FE-03 — Servicio no disponible:** Firebase retorna error 503. El sistema muestra mensaje de servicio temporalmente no disponible.

---

### CU-02 — Consultar Información de Transporte Aéreo

| Campo | Detalle |
|---|---|
| **Identificador** | CU-02 |
| **Nombre** | Consultar información de transporte aéreo |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador, Mistral AI, Tavily Search |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Alta |
| **Requerimientos asociados** | RF-03, RF-05, RF-06, RF-07, RNF-01, RNF-02 |

**Descripción breve:** El usuario realiza una consulta en lenguaje natural sobre vuelos, aerolíneas, tarifas o aeropuertos dentro de Perú. El sistema detecta la necesidad de búsqueda web actualizada, obtiene información de Tavily y la procesa con Mistral AI para generar una respuesta estructurada con comparativas, precios y fuentes.

**Precondiciones:**
- El usuario ha iniciado sesión con rol `assistant_user` o `admin`.
- Existe al menos un chat activo o se inicia uno nuevo.
- Los servicios Mistral AI y Tavily están disponibles.

**Postcondiciones:**
- El sistema muestra una respuesta formateada en markdown con tablas de precios, aerolíneas disponibles y fuentes web.
- El par pregunta/respuesta se persiste en Firestore bajo `sessions/{uid}/chats/{chat_id}`.
- El sidebar actualiza la vista previa del chat activo.

**Flujo básico:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Usuario | Escribe consulta (ej: "¿Cuánto cuesta el vuelo Lima-Cusco con LATAM este fin de semana?") |
| 2 | Sistema | Detecta keywords de transporte aéreo (`vuelo`, `aerolínea`, `LATAM`, etc.) |
| 3 | Sistema | Activa búsqueda web: llama a Tavily con query de transporte + fecha |
| 4 | Tavily | Devuelve hasta 4 snippets con precios y fuentes actualizadas |
| 5 | Sistema | Determina la ciudad destino para incluir clima automáticamente |
| 6 | Sistema | Llama a Tavily para condiciones climáticas del destino |
| 7 | Sistema | Construye el contexto completo y envía a Mistral AI con el historial del chat |
| 8 | Mistral AI | Genera respuesta estructurada con emojis, tablas markdown y fuentes |
| 9 | Sistema | Muestra la respuesta en el área de chat con chip "✈️ Transporte" |
| 10 | Sistema | Persiste pregunta y respuesta en Firestore |
| 11 | Sistema | Muestra badge "🔍 Búsqueda web" si se usó Tavily |

**Flujos alternativos:**

- **FA-01 — Sin resultados de Tavily:** El sistema usa exclusivamente el conocimiento base de Mistral AI e indica que la información puede no ser la más reciente.
- **FA-02 — Consulta ambigua:** El sistema responde con información general y sugiere especificar fechas o aerolíneas.
- **FA-03 — Ciudad no reconocida:** El sistema usa Lima como ciudad de referencia por defecto.

**Flujos de excepción:**

- **FE-01 — Timeout de Mistral:** El sistema informa al usuario y sugiere reintentar.
- **FE-02 — Error de Firestore:** Se muestra la respuesta al usuario pero se notifica que el historial no pudo guardarse.
- **FE-03 — Error 502 del agente:** El backend retorna HTTP 502; el sistema muestra burbuja de error en el chat.

**Información de dominio — Aerolíneas cubiertas:**

| Aerolínea | Tipo |
|---|---|
| LATAM Perú | Nacional e internacional |
| Sky Airline | Nacional |
| Avianca | Internacional con escala |
| JetSmart | Bajo costo |
| Star Perú | Regional |

---

### CU-03 — Consultar Información de Transporte Terrestre

| Campo | Detalle |
|---|---|
| **Identificador** | CU-03 |
| **Nombre** | Consultar información de transporte terrestre |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador, Mistral AI, Tavily Search |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Alta |
| **Requerimientos asociados** | RF-03, RF-05, RF-06, RF-08, RNF-01 |

**Descripción breve:** El usuario consulta rutas, horarios, precios y comparativas de empresas de buses interprovinciales o trenes turísticos. El sistema proporciona comparativas entre operadores económicos y premium con tiempos de viaje y comodidades.

**Precondiciones:** Mismas que CU-02.

**Postcondiciones:** Mismas que CU-02 con chip "🚌 Transporte".

**Flujo básico:** Idéntico a CU-02, con detección de keywords de transporte terrestre (`bus`, `Cruz del Sur`, `Oltursa`, `terminal`, etc.) y enfoque en operadores de buses y trenes.

**Información de dominio — Operadores cubiertos:**

| Operador | Categoría |
|---|---|
| Cruz del Sur | Premium — Buses cama |
| Oltursa | Premium — Buses cama |
| Tepsa | Semi-cama / Premium |
| Civa | Económico / Semi-cama |
| Móvil Tours | Económico / Semi-cama |
| Ittsa | Económico |
| Flores Hermanos | Económico — Sur del Perú |
| PeruRail | Tren Cusco-Machu Picchu |
| Inca Rail | Tren turístico Cusco-Aguas Calientes |

---

### CU-04 — Consultar Opciones de Hospedaje

| Campo | Detalle |
|---|---|
| **Identificador** | CU-04 |
| **Nombre** | Consultar opciones de hospedaje |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador, Mistral AI, Tavily Search |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Alta |
| **Requerimientos asociados** | RF-03, RF-05, RF-09, RNF-01 |

**Descripción breve:** El usuario consulta alojamientos disponibles en un destino peruano. El sistema provee una comparativa entre opciones económicas (hostales, albergues) y opciones cómodas (hoteles 3-5 estrellas), con rangos de precio en soles y dólares, y recomendaciones según el perfil del viajero.

**Postcondiciones:** Respuesta con chip "🏨 Hospedaje". Comparativa en tabla markdown: Opción | Categoría | Precio/noche | Incluye.

---

### CU-05 — Consultar Gastronomía y Transporte Local

| Campo | Detalle |
|---|---|
| **Identificador** | CU-05 |
| **Nombre** | Consultar gastronomía y transporte local |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador, Mistral AI, Tavily Search |
| **Prioridad** | Media |
| **Frecuencia de uso** | Media |
| **Requerimientos asociados** | RF-03, RF-05, RF-10, RNF-01 |

**Descripción breve:** El usuario consulta restaurantes típicos, precios de menús del día, platos emblemáticos del destino y opciones de movilidad local (taxi, mototaxi, Uber, combi). El sistema provee rangos de precio y alternativas económicas versus cómodas.

**Información de dominio:** Platos cubiertos: ceviche, lomo saltado, ají de gallina, causa, anticuchos, juane, entre otros. Movilidad local: taxi formal, InDriver, Uber, mototaxi, combi/micro, colectivo.

---

### CU-06 — Consultar Atracciones Turísticas

| Campo | Detalle |
|---|---|
| **Identificador** | CU-06 |
| **Nombre** | Consultar atracciones turísticas y sus costos |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador, Mistral AI, Tavily Search |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Alta |
| **Requerimientos asociados** | RF-03, RF-05, RF-11, RNF-01 |

**Descripción breve:** El usuario consulta museos, ruinas, miradores, tours guiados y actividades recreativas disponibles en un destino. El sistema provee listas de los principales atractivos con costos de entrada, horarios orientativos y recomendaciones de visita.

**Información de dominio — Atractivos clave por destino:**

| Destino | Principales Atractivos |
|---|---|
| Cusco | Machu Picchu, Sacsayhuamán, Plaza de Armas, Valle Sagrado, Qorikancha |
| Lima | Larco Museum, Circuito Mágico del Agua, Miraflores, Barranco |
| Arequipa | Cañón del Colca, Monasterio de Santa Catalina, Plaza de Armas |
| Iquitos | Reserva Nacional Pacaya Samiria, Río Amazonas |
| Puno | Lago Titicaca, Islas Uros, Sillustani |
| Paracas | Reserva Nacional de Paracas, Islas Ballestas |

---

### CU-07 — Consultar Condiciones Climáticas

| Campo | Detalle |
|---|---|
| **Identificador** | CU-07 |
| **Nombre** | Consultar condiciones climáticas en destino |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador, Mistral AI, Tavily Search |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Muy alta — incluida automáticamente en todas las respuestas con ciudad destino |
| **Requerimientos asociados** | RF-03, RF-05, RF-12, RNF-01 |

**Descripción breve:** El usuario consulta las condiciones meteorológicas actuales o futuras de una ciudad peruana. De forma **obligatoria**, el sistema incluye esta información en toda respuesta que mencione una ciudad destino, aunque el usuario no la haya solicitado explícitamente. El sistema provee temperatura (máxima/mínima), precipitaciones, humedad y recomendaciones de vestimenta.

**Regla de negocio crítica:** El sistema prompt de Mistral AI incluye la instrucción obligatoria: *"OBLIGATORIO: cuando se mencione una ciudad destino, incluye SIEMPRE al final la sección ☁️ Clima en [ciudad]".*

**Flujo básico:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Sistema | Detecta ciudad destino en la consulta del usuario |
| 2 | Sistema | Llama a Tavily con query: "clima tiempo meteorológico [ciudad] Perú [fecha]" |
| 3 | Tavily | Devuelve 2 snippets con temperatura y precipitaciones actualizados |
| 4 | Mistral AI | Genera sección "☁️ Clima en [ciudad]" con temperatura máx./mín., precipitación, recomendaciones de ropa |
| 5 | Sistema | Muestra respuesta con chip "☁️ Clima" |

---

### CU-08 — Generar Respuesta con IA (Caso de Uso Incluido)

| Campo | Detalle |
|---|---|
| **Identificador** | CU-08 |
| **Nombre** | Generar respuesta con Inteligencia Artificial |
| **Versión** | 1.0 |
| **Actores** | Mistral AI, Tavily Search (sistemas externos) |
| **Tipo** | Caso de uso incluido — `<<include>>` desde CU-02 a CU-07 |
| **Prioridad** | Alta |
| **Requerimientos asociados** | RF-05, RF-06, RF-12, RF-13, RNF-01, RNF-02 |

**Descripción breve:** Proceso interno que orquesta la generación de respuestas: evalúa si se requiere búsqueda web, obtiene snippets de Tavily, construye el contexto con historial del chat, invoca Mistral AI y procesa la respuesta.

**Proceso interno detallado:**

```
ENTRADA: mensaje del usuario + historial del chat
   │
   ▼
¿Mensaje contiene keywords de búsqueda?
(vuelo, bus, hotel, clima, precio, ciudad peruana, etc.)
   │
   ├─ SÍ ──► Tavily Search: transporte + hospedaje (4 snippets)
   │          Tavily Search: clima en ciudad detectada (2 snippets)
   │          used_search = True
   │
   └─ NO ──► Usar solo conocimiento base de Mistral AI
              used_search = False
   │
   ▼
Construir system prompt con:
  - Fecha actual (referencia para precios y temporadas)
  - Rol del asistente (experto en viajes Perú)
  - Reglas de formato (emojis, tablas markdown, fuentes)
  - Obligación de incluir clima en ciudades destino
  - Snippets web (si se buscó)
   │
   ▼
Enviar a Mistral AI: system_prompt + historial + mensaje
   │
   ▼
Recibir respuesta en markdown estructurado
   │
   ▼
Retornar: {response, tokens_used, used_search}
```

---

### CU-09 — Exportar Reporte PDF Detallado

| Campo | Detalle |
|---|---|
| **Identificador** | CU-09 |
| **Nombre** | Exportar reporte PDF detallado |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Media |
| **Requerimientos asociados** | RF-14, RF-15, RNF-05 |

**Descripción breve:** El usuario descarga un documento PDF profesional con toda la conversación activa organizada automáticamente en secciones temáticas codificadas por colores. El PDF se genera completamente en el navegador del cliente (sin envío al servidor) usando la librería jsPDF.

**Precondiciones:**
- El usuario ha iniciado sesión con rol `assistant_user` o `admin`.
- Existe al menos un intercambio (pregunta/respuesta) en el chat activo.

**Postcondiciones:**
- Se descarga un archivo PDF nombrado `recomendaciones-viaje-peru-YYYY-MM-DD.pdf`.
- No se modifica ningún dato en el servidor.

**Flujo básico:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Usuario | Hace clic en el botón "PDF" del header |
| 2 | Sistema | Invoca `exportPDF(messages, userEmail)` en el frontend |
| 3 | Sistema | Importa dinámicamente la librería jsPDF |
| 4 | Sistema | Genera portada con encabezado azul/dorado, título, fecha, hora y usuario |
| 5 | Sistema | Clasifica cada par Q/A en la sección temática más relevante (primera coincidencia) |
| 6 | Sistema | Renderiza solo las secciones que tienen contenido (secciones vacías se omiten) |
| 7 | Sistema | Genera pie de página con número de página en cada hoja |
| 8 | Sistema | Descarga el PDF en el dispositivo del usuario |

**Estructura del PDF generado:**

```
┌─────────────────────────────────────────────┐
│  PORTADA (Azul + Franja Dorada)             │
│  Título del sistema                          │
│  Subtítulo + disclaimer                      │
│  Franja de metadatos: Fecha, Hora, Usuario   │
├─────────────────────────────────────────────┤
│  ✈️ COSTOS DE VIAJE EN VUELO Y BUS           │
│  (Solo si la conversación incluyó este tema) │
│  ┌─────────────────────────────────────────┐│
│  │ [Pregunta del usuario]                  ││
│  │ [Respuesta del asistente con tablas]    ││
│  └─────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│  ☁️ DATOS DEL CLIMA EN CIUDAD DESTINO        │
├─────────────────────────────────────────────┤
│  🏨 COSTOS DE HOSPEDAJE — ALTERNATIVAS       │
├─────────────────────────────────────────────┤
│  🍽️ COSTOS DE ALIMENTACIÓN Y TRANSP. LOCAL  │
├─────────────────────────────────────────────┤
│  🗺️ LUGARES QUE VISITAR Y SUS COSTOS         │
├─────────────────────────────────────────────┤
│  ℹ️ OTROS DATOS DE INTERÉS PARA EL TURISTA  │
├─────────────────────────────────────────────┤
│  PIE DE PÁGINA: Sistema | Pag. X / Total    │
└─────────────────────────────────────────────┘
```

**Reglas de clasificación de contenido:**
- Cada par Q/A se asigna a **una sola sección** (primera coincidencia gana).
- La detección usa expresiones regulares sobre el texto completo (pregunta + respuesta).
- Las secciones sin contenido no se renderizan, generando un PDF más compacto.
- El texto pasa por `normalizePDF()` que elimina caracteres no soportados por jsPDF/Helvetica (fuera de Latin-1).

---

### CU-10 — Exportar Resumen Ejecutivo PDF

| Campo | Detalle |
|---|---|
| **Identificador** | CU-10 |
| **Nombre** | Exportar resumen ejecutivo PDF generado por IA |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador, Mistral AI |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Media |
| **Requerimientos asociados** | RF-14, RF-16, RF-17, RNF-01, RNF-05 |

**Descripción breve:** El usuario descarga un resumen ejecutivo de máximo 2 páginas, generado mediante una segunda llamada a Mistral AI que extrae y estructura la información más relevante de la conversación: destino, condiciones climáticas, tabla comparativa de costos (económico vs. cómodo) y lugares sugeridos. El diseño está optimizado para una lectura de un solo vistazo.

**Precondiciones:**
- El usuario ha iniciado sesión con rol `assistant_user` o `admin`.
- Existe al menos un intercambio en el chat activo.
- El servicio Mistral AI está disponible.

**Postcondiciones:**
- Se descarga `resumen-ejecutivo-peru-YYYY-MM-DD.pdf`.
- El endpoint `POST /summary` registra los tokens utilizados en la generación.

**Flujo básico:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Usuario | Hace clic en el botón "Resumen" (dorado) del header |
| 2 | Sistema | Llama a `POST /summary` con el `chat_id` activo |
| 3 | Backend | Obtiene mensajes del chat desde Firestore |
| 4 | Mistral AI | Recibe el historial completo y genera JSON estructurado con: destino, clima, costos, lugares, consejos |
| 5 | Backend | Retorna el JSON al frontend |
| 6 | Sistema | Importa jsPDF y construye el PDF con el diseño estructurado |
| 7 | Sistema | Descarga el archivo en el dispositivo del usuario |

**Estructura del Resumen Ejecutivo:**

```
┌─────────────────────────────────────────────────────────┐
│  RESUMEN EJECUTIVO DE VIAJE - PERU               [Gold] │
│  Fecha | Hora | Usuario                                   │
│  DESTINO: CUSCO                              [Dark blue] │
├──────────────────────────────┬──────────────────────────┤
│  CONDICIONES CLIMATICAS      │  LUGARES SUGERIDOS        │
│  [Teal]                      │  [Purple]                 │
│  Temperatura: 8-22°C         │  - Machu Picchu           │
│  Condición: Frío seco        │  - Plaza de Armas         │
│  Llevar: Abrigo + impermeable│  - Sacsayhuamán           │
│                              │  - Valle Sagrado          │
│                              │  - Qorikancha             │
├──────────────────────────────┴──────────────────────────┤
│  COMPARATIVA DE COSTOS — ECONOMICO vs COMODO   [Blue]   │
│  Concepto        │ Opción Económica  │ Opción Cómoda     │
│  Transporte      │ Bus S/. 80        │ Vuelo S/. 350     │
│  Hospedaje       │ Hostal S/. 45/n   │ Hotel S/. 250/n   │
│  Alimentación    │ Menú S/. 15       │ Rest. S/. 60      │
│  Tours/Entradas  │ Tour básico S/. 40│ Tour full S/. 180 │
├─────────────────────────────────────────────────────────┤
│  RECOMENDACIONES Y CONSEJOS CLAVE              [Gray]   │
│  - Aclimatarse 1-2 días en Cusco antes de actividades   │
│  - Llevar documento de identidad para Boleto Turístico  │
│  - Moneda local: Soles (S/.). ATMs disponibles en plaza │
└─────────────────────────────────────────────────────────┘
```

**Flujo alternativo — Fallo del backend:**
Si el endpoint `/summary` falla, el sistema usa una estructura vacía con valores "No disponible" y genera el PDF sin datos de IA, notificando al usuario que la información puede ser incompleta.

---

### CU-11 — Gestionar Historial de Chats

| Campo | Detalle |
|---|---|
| **Identificador** | CU-11 |
| **Nombre** | Gestionar historial de chats |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Muy alta |
| **Requerimientos asociados** | RF-18, RF-19, RF-20, RF-21, RNF-04 |

**Descripción breve:** El usuario puede crear nuevos chats, navegar entre conversaciones anteriores mediante el sidebar, y eliminar chats individuales o todo el historial. Cada chat se identifica con un ID basado en fecha/hora y persiste automáticamente en Firestore.

**Precondiciones:**
- El usuario ha iniciado sesión con rol `assistant_user` o `admin`.

**Postcondiciones:**
- Los cambios en el historial se reflejan en Firestore y en el sidebar en tiempo real.

**Sub-casos incluidos:**

**CU-11a — Crear nuevo chat:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Usuario | Hace clic en "+ Nuevo Chat" (sidebar o header) |
| 2 | Sistema | Genera nuevo `chat_id` = `YYYYMMDD_HHmmss_mmm` |
| 3 | Sistema | Limpia el área de mensajes |
| 4 | Sistema | Actualiza el sidebar (el chat anterior queda guardado) |
| 5 | Sistema | Activa el modo de chat en vivo |

**CU-11b — Navegar a chat anterior:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Usuario | Abre el sidebar (botón hamburguesa) |
| 2 | Sistema | Muestra lista de chats ordenados del más reciente al más antiguo con vista previa |
| 3 | Usuario | Hace clic en un chat del historial |
| 4 | Sistema | Llama a `GET /chats/{chat_id}` y carga los mensajes |
| 5 | Sistema | Muestra banner "Estás viendo un chat del historial — solo lectura" |
| 6 | Sistema | Muestra botón "Iniciar Nuevo Chat" en lugar del input |

**CU-11c — Eliminar todos los chats:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Usuario | Hace clic en el botón "Limpiar" del header |
| 2 | Sistema | Muestra confirmación: "¿Borrar TODOS los chats del historial?" |
| 3 | Usuario | Confirma la acción |
| 4 | Sistema | Llama a `DELETE /chats` |
| 5 | Sistema | Elimina todos los documentos de la subcollection en Firestore |
| 6 | Sistema | Limpia el área de mensajes y el sidebar |
| 7 | Sistema | Genera nuevo `chat_id` para la próxima conversación |

**Flujo de excepción — Error de Firestore:**
Si la operación de eliminación falla, el sistema muestra alerta con el mensaje de error y no modifica el estado local.

---

### CU-12 — Gestionar Perfil de Usuario

| Campo | Detalle |
|---|---|
| **Identificador** | CU-12 |
| **Nombre** | Gestionar perfil de usuario |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Administrador |
| **Prioridad** | Media |
| **Frecuencia de uso** | Baja |
| **Requerimientos asociados** | RF-22, RF-23, RNF-04 |

**Descripción breve:** El usuario puede consultar y actualizar su perfil: nombre, preferencias de viaje y notas personales. El sistema actualiza automáticamente la fecha del último ingreso en cada sesión.

**Datos del perfil:**

| Campo | Tipo | Editable | Descripción |
|---|---|:---:|---|
| `cliente_id` | String (UID) | ❌ | Identificador único Firebase |
| `nombre` | String (max 200) | ✅ | Nombre del usuario |
| `email` | String | ❌ | Correo de Firebase Auth |
| `preferencias` | Array[String] | ✅ | Tipos de viaje preferidos |
| `notas` | String (max 2000) | ✅ | Notas personales o de viaje |
| `fecha_ultimo_ingreso` | ISO DateTime | ❌ (auto) | Actualizado en cada login |

---

### CU-13 — Cerrar Sesión

| Campo | Detalle |
|---|---|
| **Identificador** | CU-13 |
| **Nombre** | Cerrar sesión |
| **Versión** | 1.0 |
| **Actores** | Turista/Usuario, Visualizador, Administrador, Firebase Authentication |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Alta |
| **Requerimientos asociados** | RF-02, RNF-03 |

**Flujo básico:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Usuario | Hace clic en el botón "Salir" del header |
| 2 | Sistema | Llama a `signOut(auth)` de Firebase JS SDK |
| 3 | Firebase Auth | Invalida el token de sesión localmente |
| 4 | Sistema | Redirige a la pantalla de Login |
| 5 | Sistema | Limpia el estado de la aplicación en memoria |

---

### CU-14 — Administrar Usuarios y Roles

| Campo | Detalle |
|---|---|
| **Identificador** | CU-14 |
| **Nombre** | Administrar usuarios y roles |
| **Versión** | 1.0 |
| **Actores** | Administrador, Firebase Authentication |
| **Prioridad** | Alta |
| **Frecuencia de uso** | Baja |
| **Requerimientos asociados** | RF-24, RF-25, RF-26, RNF-03, RNF-04 |

**Descripción breve:** El administrador gestiona todos los usuarios registrados en Firebase: visualiza la lista completa con roles, asigna o cambia roles mediante un desplegable y elimina cuentas permanentemente.

**Precondiciones:**
- El usuario autenticado tiene rol `admin`.
- Accede a la pestaña "Administración" del panel principal.

**Sub-casos:**

**CU-14a — Listar usuarios:**
El sistema llama a `GET /admin/users` y muestra una tabla con: Email, Nombre, Rol actual, Fecha de creación, Último ingreso.

**CU-14b — Asignar/cambiar rol:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Administrador | Selecciona un rol en el desplegable del usuario objetivo |
| 2 | Sistema | Llama a `PUT /admin/users/{uid}/role` con el nuevo rol |
| 3 | Firebase Auth | Actualiza el custom claim `role` del usuario |
| 4 | Sistema | El cambio es efectivo en el próximo login del usuario afectado |

*Restricción:* El administrador no puede quitarse su propio rol.

**Roles disponibles:**

| Rol | Descripción |
|---|---|
| `assistant_user` | Acceso completo al chat y funcionalidades de usuario |
| `viewer` | Solo lectura — puede ver historial de cualquier usuario |
| `admin` | Acceso total incluyendo gestión de usuarios |
| *(sin rol)* | Sin acceso funcional hasta que se asigne un rol |

**CU-14c — Eliminar usuario:**

| Paso | Actor | Acción |
|---|---|---|
| 1 | Administrador | Hace clic en "Eliminar" sobre un usuario |
| 2 | Sistema | Muestra confirmación |
| 3 | Administrador | Confirma |
| 4 | Sistema | Llama a `DELETE /admin/users/{uid}` |
| 5 | Firebase Auth | Elimina la cuenta de Firebase |
| 6 | Sistema | Limpia el historial del usuario en Firestore |

*Restricción:* El administrador no puede eliminar su propia cuenta.

---

### CU-15 — Ver Sesiones Activas del Sistema

| Campo | Detalle |
|---|---|
| **Identificador** | CU-15 |
| **Nombre** | Ver sesiones activas del sistema |
| **Versión** | 1.0 |
| **Actores** | Administrador |
| **Prioridad** | Media |
| **Frecuencia de uso** | Baja |
| **Requerimientos asociados** | RF-27, RNF-04 |

**Descripción breve:** El administrador consulta un resumen de todas las sesiones de usuarios registradas en Firestore: número de mensajes, último acceso y datos del perfil.

---

## 6. REQUERIMIENTOS FUNCIONALES

| ID | Módulo | Descripción | Prioridad | CU Relacionado |
|---|---|---|---|---|
| **RF-01** | Acceso | El sistema debe permitir el inicio de sesión mediante correo/contraseña y Google OAuth. | Alta | CU-01 |
| **RF-02** | Acceso | El sistema debe gestionar el cierre de sesión invalidando el token Firebase localmente. | Alta | CU-01, CU-13 |
| **RF-03** | Chat | El sistema debe aceptar consultas en lenguaje natural en español sobre viajes en Perú. | Alta | CU-02 a CU-07 |
| **RF-04** | Chat | El sistema debe mantener el contexto de la conversación activa durante toda la sesión. | Alta | CU-02 a CU-07 |
| **RF-05** | IA | El sistema debe detectar automáticamente si una consulta requiere búsqueda web actualizada. | Alta | CU-08 |
| **RF-06** | IA | El sistema debe llamar a Tavily Search con consultas de transporte y hospedaje cuando se detecten keywords relevantes. | Alta | CU-08 |
| **RF-07** | Consulta | El sistema debe cubrir aerolíneas: LATAM, Sky, Avianca, JetSmart y Star Perú. | Alta | CU-02 |
| **RF-08** | Consulta | El sistema debe cubrir operadores de bus: Cruz del Sur, Oltursa, Tepsa, Civa, Móvil Tours, Ittsa, Flores; y trenes: PeruRail, Inca Rail. | Alta | CU-03 |
| **RF-09** | Consulta | El sistema debe proveer comparativas de hospedaje entre opciones económicas y cómodas. | Alta | CU-04 |
| **RF-10** | Consulta | El sistema debe informar sobre gastronomía típica y transporte local (taxi, Uber, mototaxi, combi). | Media | CU-05 |
| **RF-11** | Consulta | El sistema debe proporcionar información de atracciones turísticas con costos de entrada y horarios. | Alta | CU-06 |
| **RF-12** | IA | El sistema debe incluir **obligatoriamente** información climática en toda respuesta que mencione una ciudad destino. | Alta | CU-07, CU-08 |
| **RF-13** | IA | El sistema debe usar la fecha actual como referencia para temporadas, precios y disponibilidad. | Alta | CU-08 |
| **RF-14** | PDF | El sistema debe permitir exportar la conversación activa en formato PDF. | Alta | CU-09, CU-10 |
| **RF-15** | PDF | El PDF detallado debe organizar el contenido en secciones temáticas con codificación por colores; las secciones sin contenido no deben renderizarse. | Alta | CU-09 |
| **RF-16** | PDF | El resumen ejecutivo debe ser generado por Mistral AI extrayendo: destino, clima, costos comparativos, lugares y consejos. | Alta | CU-10 |
| **RF-17** | PDF | El resumen ejecutivo debe presentar un diseño de dos columnas (Clima \| Lugares) seguido de una tabla comparativa Económico vs. Cómodo. | Alta | CU-10 |
| **RF-18** | Historial | El sistema debe persistir automáticamente cada mensaje en Firestore bajo `sessions/{uid}/chats/{chat_id}`. | Alta | CU-11 |
| **RF-19** | Historial | El sistema debe generar IDs de chat basados en fecha/hora: `YYYYMMDD_HHmmss_mmm`. | Alta | CU-11 |
| **RF-20** | Historial | El sidebar debe mostrar la lista de chats ordenada del más reciente al más antiguo, con vista previa y conteo de consultas. | Alta | CU-11 |
| **RF-21** | Historial | El sistema debe permitir eliminar chats individuales o todos los chats del historial. | Media | CU-11 |
| **RF-22** | Perfil | El sistema debe almacenar y permitir editar el perfil del usuario (nombre, preferencias, notas). | Media | CU-12 |
| **RF-23** | Perfil | El sistema debe actualizar automáticamente `fecha_ultimo_ingreso` en cada autenticación exitosa. | Media | CU-12 |
| **RF-24** | Admin | El sistema debe permitir al administrador listar todos los usuarios con sus roles. | Alta | CU-14 |
| **RF-25** | Admin | El sistema debe permitir al administrador asignar o cambiar roles mediante custom claims de Firebase. | Alta | CU-14 |
| **RF-26** | Admin | El sistema debe permitir al administrador eliminar cuentas de usuario permanentemente, incluyendo su historial en Firestore. | Alta | CU-14 |
| **RF-27** | Admin | El sistema debe proveer al administrador un resumen de todas las sesiones activas. | Media | CU-15 |

---

## 7. REQUERIMIENTOS NO FUNCIONALES

### 7.1 Rendimiento (Performance)

| ID | Descripción | Métrica |
|---|---|---|
| **RNF-01** | Tiempo de respuesta del asistente IA | Máximo 15 segundos para respuestas con búsqueda web; máximo 8 segundos sin búsqueda |
| **RNF-02** | Tiempo de generación del resumen ejecutivo PDF | Máximo 20 segundos (incluye llamada a Mistral AI para extracción) |
| **RNF-03** | Tiempo de autenticación | Máximo 3 segundos para login y verificación de token |
| **RNF-04** | Carga de historial de chats | Máximo 2 segundos para listar todos los chats del usuario |
| **RNF-05** | Generación de PDF (cliente) | Máximo 3 segundos para generación y descarga del PDF (proceso local en el navegador) |

### 7.2 Seguridad

| ID | Descripción |
|---|---|
| **RNF-06** | Toda comunicación entre frontend y backend debe realizarse sobre HTTPS |
| **RNF-07** | Cada petición a la API debe incluir un Bearer Token JWT válido emitido por Firebase |
| **RNF-08** | Los tokens JWT se verifican en cada petición sin almacenarse en el servidor |
| **RNF-09** | El control de acceso por roles se valida en cada endpoint (no solo en el frontend) |
| **RNF-10** | Las API Keys (Mistral, Tavily, Firebase) deben almacenarse como variables de entorno, nunca en el código fuente |
| **RNF-11** | El administrador no puede eliminar ni quitar el rol de su propia cuenta (protección de integridad) |
| **RNF-12** | Las credenciales de Google Cloud (service account) se codifican en Base64 para su uso seguro en Railway/Docker |

### 7.3 Usabilidad

| ID | Descripción |
|---|---|
| **RNF-13** | La interfaz debe ser responsiva y funcionar correctamente en dispositivos móviles (iOS/Android) y escritorio |
| **RNF-14** | En dispositivos móviles, el sidebar debe comportarse como overlay con backdrop, sin afectar el layout principal |
| **RNF-15** | Los botones del header deben permanecer visibles en toda condición de viewport, incluyendo iOS Safari con barra de dirección visible (`height: 100svh`) |
| **RNF-16** | Las respuestas del asistente deben renderizarse con markdown enriquecido (tablas, negritas, listas, encabezados) |
| **RNF-17** | Cada respuesta debe mostrar automáticamente un chip de categoría (✈️ 🚌 🏨 🍽️ 🗺️ ☁️) para identificación visual rápida |
| **RNF-18** | El indicador de "escribiendo..." (3 puntos animados) debe mostrarse durante el procesamiento de la respuesta |
| **RNF-19** | El PDF exportado debe ser legible en cualquier visor de PDF estándar, sin caracteres ilegibles |

### 7.4 Disponibilidad y Escalabilidad

| ID | Descripción |
|---|---|
| **RNF-20** | El sistema debe estar disponible 24/7 con un SLA mínimo del 99.5% (Railway + Firestore) |
| **RNF-21** | El backend debe soportar múltiples usuarios concurrentes sin degradación de rendimiento |
| **RNF-22** | El despliegue en Railway debe realizarse automáticamente ante cada `git push` a la rama `main` |
| **RNF-23** | El sistema debe recuperarse automáticamente de fallos transitorios de los servicios externos (Tavily, Mistral) |

### 7.5 Mantenibilidad

| ID | Descripción |
|---|---|
| **RNF-24** | La arquitectura debe separar claramente: capa de autenticación (`auth.py`), lógica de negocio (`agent.py`), acceso a datos (`firestore_service.py`) y API (`main.py`) |
| **RNF-25** | El frontend debe construirse como SPA (Single Page Application) con componentes React reutilizables |
| **RNF-26** | La documentación de la API debe mantenerse actualizada y accesible en `/docs` (Swagger automático de FastAPI) |

### 7.6 Compatibilidad

| ID | Descripción |
|---|---|
| **RNF-27** | El frontend debe ser compatible con Chrome, Firefox, Safari (iOS/macOS) y Edge en versiones modernas (últimos 2 años) |
| **RNF-28** | El PDF generado debe ser compatible con Adobe Acrobat, Foxit, y visores nativos de iOS/Android |
| **RNF-29** | La API REST debe mantener compatibilidad hacia atrás; cambios que rompan contratos deben versionarse |

---

## 8. REGLAS DE NEGOCIO

| ID | Descripción | Impacto |
|---|---|---|
| **RN-01** | **Clima obligatorio:** Toda respuesta que mencione una ciudad destino peruana debe incluir la sección de condiciones climáticas, aunque el usuario no la solicite explícitamente. | Alto — implementado en el system prompt de Mistral |
| **RN-02** | **Fecha de referencia:** El asistente usa siempre la fecha actual del servidor (UTC) para determinar temporadas, precios y disponibilidad. Si el usuario especifica una fecha futura, se usa esa como referencia. | Alto — incluido en el system prompt |
| **RN-03** | **Cobertura geográfica:** El sistema cubre exclusivamente viajes dentro del territorio peruano. Consultas sobre destinos internacionales se responden con información limitada. | Alto |
| **RN-04** | **Primera coincidencia en PDF:** Cada par pregunta/respuesta aparece en **una sola sección** del PDF detallado. La clasificación usa la primera sección cuyo regex coincide con el contenido. | Alto — implementado en `exportPDF()` |
| **RN-05** | **Auto-guardado:** Todo mensaje enviado al asistente se persiste automáticamente en Firestore. No existe modo de chat "sin guardar". | Alto |
| **RN-06** | **ID único de chat:** Cada sesión de chat se identifica con un ID basado en fecha/hora `YYYYMMDD_HHmmss_mmm`. El ID se genera en el cliente (frontend) al iniciar un nuevo chat. | Alto |
| **RN-07** | **Protección de cuenta propia:** Un administrador no puede eliminar ni quitar el rol a su propia cuenta para evitar bloqueos. | Alto — validado en el backend |
| **RN-08** | **Token de autenticación:** El JWT se renueva automáticamente por el SDK de Firebase. El hook `useApi` reintenta peticiones ante respuestas 401/403. | Alto |
| **RN-09** | **Resumen ejecutivo por IA:** El resumen PDF se genera enviando la conversación completa a Mistral con temperatura 0.1, priorizando precisión sobre creatividad en la extracción de datos. | Alto |
| **RN-10** | **Compatibilidad PDF (Latin-1):** Todos los textos en el PDF pasan por `normalizePDF()` que elimina caracteres fuera del rango Latin-1 (U+0020–U+007E, U+00A0–U+00FF), emojis, flechas Unicode y el carácter `#`. | Medio |
| **RN-11** | **Roles y custom claims:** Los roles se almacenan como custom claims en Firebase Auth. Los cambios de rol son efectivos en el **siguiente inicio de sesión** del usuario afectado. | Medio |
| **RN-12** | **Búsqueda condicional:** Tavily se invoca solo cuando el mensaje contiene keywords predefinidos (precio, vuelo, bus, hotel, clima, ciudades peruanas, etc.) para optimizar costos de API. | Medio |

---

## 9. GLOSARIO

| Término | Definición |
|---|---|
| **Asistente conversacional** | Sistema de software que interactúa con el usuario mediante lenguaje natural para responder preguntas y proveer información |
| **Bearer Token** | Método de autenticación HTTP donde el cliente envía el token en el header `Authorization: Bearer <token>` |
| **Chat ID** | Identificador único de una sesión de chat, formato `YYYYMMDD_HHmmss_mmm` (año, mes, día, hora, minuto, segundo, milisegundo) |
| **Custom Claims** | Atributos personalizados en los tokens JWT de Firebase para almacenar información adicional como el rol del usuario |
| **Firestore** | Base de datos NoSQL orientada a documentos de Google, con soporte para colecciones, subcollections y actualizaciones en tiempo real |
| **jsPDF** | Librería JavaScript para generar archivos PDF directamente en el navegador, sin envío al servidor |
| **JWT** | JSON Web Token — estándar abierto (RFC 7519) para transmitir información de forma segura entre partes como objeto JSON firmado |
| **LLM** | Large Language Model — modelo de IA entrenado con grandes volúmenes de texto para generar respuestas en lenguaje natural |
| **Markdown** | Lenguaje de marcado ligero que permite formatear texto con sintaxis simple (negritas, tablas, listas, encabezados) |
| **Mistral AI** | Empresa francesa de IA. Su modelo `mistral-large-latest` es el motor de respuesta principal de este sistema |
| **Panel de Administración** | Módulo de la interfaz accesible solo para el rol `admin`, que permite gestionar usuarios y roles |
| **PDF Detallado** | Modalidad de exportación que organiza toda la conversación en secciones temáticas codificadas por colores |
| **Resumen Ejecutivo** | Modalidad de exportación generada por IA que condensa la información más relevante en un diseño visual escaneable de máximo 2 páginas |
| **Rol** | Nivel de acceso asignado a un usuario: `assistant_user` (uso completo), `viewer` (solo lectura), `admin` (administración) |
| **Sidebar** | Panel lateral de la interfaz que muestra el historial de chats y permite navegar entre sesiones anteriores |
| **SPA** | Single Page Application — aplicación web que carga una sola página HTML y actualiza el contenido dinámicamente sin recargas completas |
| **Tavily** | Servicio de búsqueda web en tiempo real optimizado para aplicaciones de IA, que retorna snippets de contenido relevante |
| **Token JWT** | Ver JWT. En este sistema, emitido por Firebase con duración de 1 hora y renovación automática |
| **Turista/Usuario** | Persona que usa el sistema para planificar o informarse sobre un viaje dentro del Perú |
| **Uvicorn** | Servidor ASGI (Asynchronous Server Gateway Interface) de alto rendimiento, usado para ejecutar la aplicación FastAPI |
| **Vista previa** | Primeras palabras del primer mensaje del chat, mostradas en el sidebar como referencia rápida |

---

*Documento generado en base al código fuente del sistema — versión de producción activa en Railway.*
*Última actualización: Mayo 2026*
