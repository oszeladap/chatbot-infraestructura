# Chatbot Infraestructura

Chatbot con búsqueda web en tiempo real construido con **Mistral AI**, **Tavily** y **Firebase/Firestore**. El backend expone una API REST con FastAPI y el frontend es una SPA ligera en HTML/CSS/JS.

## Estructura

```
chatbot-infraestructura/
├── backend/          # API FastAPI (Python)
│   ├── main.py       # Entrypoint y rutas
│   ├── agent.py      # Lógica del agente (Mistral + Tavily)
│   ├── auth.py       # Verificación de tokens Firebase
│   └── firestore_service.py  # Lectura/escritura en Firestore
└── frontend/         # Interfaz web estática
    ├── index.html    # Pantalla de bienvenida
    ├── chat.html     # Interfaz de chat
    ├── app.js        # Lógica del cliente
    └── style.css     # Estilos
```

## Requisitos

- Python 3.11+
- Cuenta en [Mistral AI](https://mistral.ai/) y [Tavily](https://tavily.com/)
- Proyecto Firebase con Firestore habilitado

## Configuración

```bash
cd backend
cp .env.example .env
# Edita .env con tus claves reales
```

Coloca el archivo `service-account.json` de Firebase en la raíz del proyecto.

## Ejecución

```bash
# Instalar dependencias
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Iniciar el servidor
uvicorn main:app --reload --port 8000
```

Abre `frontend/index.html` en tu navegador o sirve la carpeta con cualquier servidor estático.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `MISTRAL_API_KEY` | Clave de la API de Mistral |
| `TAVILY_API_KEY` | Clave de la API de Tavily |
| `FIREBASE_PROJECT_ID` | ID del proyecto en Firebase |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta al archivo service-account.json |
