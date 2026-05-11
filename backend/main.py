from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")   # must run before any other local import

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import agent as agent_module
import firestore_service as fs
from auth import CurrentUser, get_current_user, require_role

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Chatbot Transporte Perú API",
    description="API REST para el asistente de transporte aéreo y terrestre en Perú.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # Bearer token, no cookies — "*" requiere False
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: str | None = Field(default=None)


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    tokens_used: int
    used_search: bool


class HistoryResponse(BaseModel):
    messages: list[dict[str, Any]]
    total_messages: int


class DeleteResponse(BaseModel):
    message: str


class ProfileResponse(BaseModel):
    cliente_id: str
    nombre: str
    email: str
    preferencias: list[str]
    notas: str
    fecha_ultimo_ingreso: str | None


class ProfileUpdateRequest(BaseModel):
    nombre: str | None = Field(default=None, max_length=200)
    preferencias: list[str] | None = None
    notas: str | None = Field(default=None, max_length=2000)


class AdminSessionsResponse(BaseModel):
    sessions: list[dict[str, Any]]
    total_sessions: int


class HealthResponse(BaseModel):
    status: str
    timestamp: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    """Public health-check endpoint. No authentication required."""
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.post(
    "/chat",
    response_model=ChatResponse,
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user"]))],
)
def chat(
    body: ChatRequest,
    user: CurrentUser,
) -> ChatResponse:
    """Send a message to the agent and persist both turns to Firestore.

    Requires role: ``assistant_user``.
    """
    uid = user["uid"]
    session_id = body.session_id or str(uuid.uuid4())

    # Update last login timestamp
    fs.touch_last_login(uid=uid, email=user.get("email", ""))

    # Retrieve prior history
    history = fs.get_session_history(uid)

    # Run the agent
    result = agent_module.run_agent(message=body.message, history=history)

    reply: str = result["response"]
    tokens: int = result["tokens_used"]
    used_search: bool = result["used_search"]

    if reply.startswith("Lo siento, ocurrió un error"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="El agente no pudo procesar la consulta. Intenta de nuevo.",
        )

    try:
        fs.save_message(uid=uid, role="user", content=body.message, tokens=0)
        fs.save_message(uid=uid, role="assistant", content=reply, tokens=tokens)
    except Exception as exc:
        print(f"[main] Firestore write error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo guardar el historial. El mensaje fue procesado.",
        )

    return ChatResponse(
        reply=reply,
        session_id=session_id,
        tokens_used=tokens,
        used_search=used_search,
    )


@app.get(
    "/history",
    response_model=HistoryResponse,
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user", "viewer"]))],
)
def get_history(
    user: CurrentUser,
    uid: Annotated[str | None, Query(description="UID objetivo (sólo para viewers)")] = None,
) -> HistoryResponse:
    """Return the full message history for a user session.

    - ``assistant_user``: always receives their own history (``uid`` param ignored).
    - ``viewer`` / ``admin``: may pass a ``uid`` query param to inspect any session.
    """
    role = user.get("role")
    target_uid: str

    if role == "assistant_user":
        target_uid = user["uid"]
    elif uid:
        target_uid = uid
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Los viewers deben indicar un uid en el query param.",
        )

    try:
        messages = fs.get_session_history(target_uid)
    except Exception as exc:
        print(f"[main] Firestore read error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo obtener el historial.",
        )

    return HistoryResponse(messages=messages, total_messages=len(messages))


@app.delete(
    "/history",
    response_model=DeleteResponse,
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user"]))],
)
def delete_history(user: CurrentUser) -> DeleteResponse:
    """Clear message history while preserving the user profile.

    Requires role: ``assistant_user``.
    """
    try:
        fs.clear_session(user["uid"])
    except Exception as exc:
        print(f"[main] Firestore delete error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo borrar el historial.",
        )

    return DeleteResponse(message="Historial borrado exitosamente")


@app.get(
    "/profile",
    response_model=ProfileResponse,
    tags=["user"],
    dependencies=[Depends(require_role(["assistant_user", "viewer", "admin"]))],
)
def get_profile(user: CurrentUser) -> ProfileResponse:
    """Return the authenticated user's profile."""
    profile = fs.get_user_profile(user["uid"])
    return ProfileResponse(**profile)


@app.put(
    "/profile",
    response_model=ProfileResponse,
    tags=["user"],
    dependencies=[Depends(require_role(["assistant_user"]))],
)
def update_profile(body: ProfileUpdateRequest, user: CurrentUser) -> ProfileResponse:
    """Update editable profile fields (nombre, preferencias, notas).

    Requires role: ``assistant_user``.
    """
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        fs.update_user_profile(user["uid"], updates)
    profile = fs.get_user_profile(user["uid"])
    return ProfileResponse(**profile)


@app.get(
    "/admin/sessions",
    response_model=AdminSessionsResponse,
    tags=["admin"],
    dependencies=[Depends(require_role(["admin"]))],
)
def admin_sessions(user: CurrentUser) -> AdminSessionsResponse:
    """Return a summary of all active sessions (admin dashboard).

    Requires role: ``admin``.
    """
    try:
        sessions = fs.get_all_sessions()
    except Exception as exc:
        print(f"[main] Firestore admin read error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudieron obtener las sesiones.",
        )

    return AdminSessionsResponse(sessions=sessions, total_sessions=len(sessions))


# ---------------------------------------------------------------------------
# Static files — prefer built React dist, fall back to raw frontend dir
# Must be mounted LAST so API routes take priority
# ---------------------------------------------------------------------------
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
_frontend_src = Path(__file__).parent.parent / "frontend"
_serve_dir = _frontend_dist if _frontend_dist.exists() else _frontend_src
if _serve_dir.exists():
    app.mount("/", StaticFiles(directory=str(_serve_dir), html=True), name="frontend")
