from __future__ import annotations

import asyncio
import base64
import io
import os
import tempfile
import urllib.parse
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

import httpx
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")   # must run before any other local import

# ---------------------------------------------------------------------------
# Cloud credentials — decode GOOGLE_CREDENTIALS_JSON (base64) if present.
# Needed on Railway / Docker where there is no local service-account file.
# ---------------------------------------------------------------------------
_creds_b64 = os.environ.get("GOOGLE_CREDENTIALS_JSON", "")
if _creds_b64 and not os.path.isfile(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")):
    _tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w")
    _tmp.write(base64.b64decode(_creds_b64).decode())
    _tmp.close()
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _tmp.name

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

import agent as agent_module
import firestore_service as fs
from auth import (
    CurrentUser, get_current_user, require_role,
    list_firebase_users, set_user_role, delete_firebase_user,
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Chatbot Transporte Perú API",
    description="API REST para el asistente de transporte aéreo y terrestre en Perú.",
    version="2.0.0",
)


class _NoCacheHtmlMiddleware(BaseHTTPMiddleware):
    """Inject no-cache headers on HTML responses so browsers always fetch the latest index.html."""
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if "text/html" in response.headers.get("content-type", ""):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        return response

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
    chat_id: str | None = Field(default=None)


class ChatResponse(BaseModel):
    reply: str
    chat_id: str
    tokens_used: int
    used_search: bool


class ChatListResponse(BaseModel):
    chats: list[dict[str, Any]]
    total_chats: int


class ChatHistoryResponse(BaseModel):
    messages: list[dict[str, Any]]
    chat_id: str


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


class AdminUsersResponse(BaseModel):
    users: list[dict[str, Any]]
    total_users: int


class UserRoleUpdateRequest(BaseModel):
    role: str | None = Field(default=None, description="Rol a asignar. None para quitar el rol.")


class HealthResponse(BaseModel):
    status: str
    timestamp: str


class SummaryRequest(BaseModel):
    chat_id: str = Field(..., min_length=1, max_length=100)


# ---------------------------------------------------------------------------
# Destination images — Wikipedia / Wikimedia Commons proxy
# Fetched server-side to avoid browser CORS issues.
# ---------------------------------------------------------------------------

_WIKI_REST  = "https://en.wikipedia.org/api/rest_v1/page/summary"
_IMG_HEADERS = {"User-Agent": "TravelPeru/2.3 oszeladap@gmail.com"}

# Maps each destination (lowercase) to Wikipedia article titles compatible with
# the REST Summary API (which handles redirects, so common names work fine).
# Rule: "plaza" = main city article (ALWAYS has a thumbnail), "top" = top attraction,
# "extra" = additional well-known articles.
_DEST_IMG_MAP: dict[str, dict[str, Any]] = {
    "cusco":        {"plaza": "Cusco",                       "top": "Machu Picchu",              "extra": ["Sacsayhuamán", "Qorikancha", "Pisac", "Ollantaytambo"]},
    "machu picchu": {"plaza": "Aguas Calientes, Peru",       "top": "Machu Picchu",              "extra": ["Inca Trail", "Huayna Picchu", "Sacred Valley", "Ollantaytambo"]},
    "lima":         {"plaza": "Lima",                        "top": "Larco Museum",              "extra": ["Miraflores", "Barranco", "Pachacamac", "Magic Water Circuit"]},
    "arequipa":     {"plaza": "Arequipa",                    "top": "Colca Canyon",              "extra": ["Monastery of Santa Catalina, Arequipa", "El Misti", "Yanahuara", "Toro Muerto petroglyphs"]},
    "puno":         {"plaza": "Puno",                        "top": "Lake Titicaca",             "extra": ["Uros people", "Sillustani", "Amantani", "Taquile"]},
    "trujillo":     {"plaza": "Trujillo, La Libertad",       "top": "Chan Chan",                 "extra": ["Huaca de la Luna", "El Brujo", "Moche culture", "Huanchaco"]},
    "iquitos":      {"plaza": "Iquitos",                     "top": "Amazon River",              "extra": ["Pacaya-Samiria National Reserve", "Amazon rainforest", "Belén, Iquitos", "Nauta, Peru"]},
    "huaraz":       {"plaza": "Huaraz",                      "top": "Huascarán National Park",   "extra": ["Llanganuco Lakes", "Pastoruri Glacier", "Chavín de Huántar", "Cordillera Blanca"]},
    "paracas":      {"plaza": "Paracas National Reserve",    "top": "Ballestas Islands",         "extra": ["Paracas, Peru", "Huacachina", "Ica, Peru", "Pisco"]},
    "nazca":        {"plaza": "Nazca",                       "top": "Nazca Lines",               "extra": ["Cahuachi", "Palpa, Peru", "Maria Reiche", "Cantalloc aqueduct"]},
    "chiclayo":     {"plaza": "Chiclayo",                    "top": "Huaca Rajada",              "extra": ["Sipán", "Lambayeque", "Túcume", "Brüning National Museum"]},
    "ayacucho":     {"plaza": "Ayacucho",                    "top": "Wari (culture)",            "extra": ["Battle of Ayacucho", "Quinua, Ayacucho", "Huanta", "Vilcashuamán"]},
    "cajamarca":    {"plaza": "Cajamarca",                   "top": "Cumbe Mayo",                "extra": ["Baños del Inca", "Ventanillas de Otuzco", "Porcón", "Cajamarca Region"]},
    "tarapoto":     {"plaza": "Tarapoto",                    "top": "Amazon rainforest",         "extra": ["Ahuashiyacu", "Sauce, San Martín", "San Martín Region", "Lamas, Peru"]},
    "tacna":        {"plaza": "Tacna",                       "top": "Tacna Region",              "extra": ["Toquepala", "Laguna Aricota", "Candarave Province", "Tacna Cathedral"]},
    "piura":        {"plaza": "Piura",                       "top": "Máncora",                   "extra": ["Piura Region", "Catacaos", "Vichayito", "Huancabamba Province"]},
    "huancayo":     {"plaza": "Huancayo",                    "top": "Mantaro Valley",            "extra": ["Junín Region", "Jauja", "Concepción, Junín", "Ingenio, Junín"]},
    "ica":          {"plaza": "Ica, Peru",                   "top": "Huacachina",                "extra": ["Ica Region", "Chincha Alta", "Palpa, Peru", "Tambo Colorado"]},
}


# ---------------------------------------------------------------------------
# Route map — real OSM tile map with walking route drawn on it
# ---------------------------------------------------------------------------

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_OSRM_DRIVE    = "https://router.project-osrm.org/route/v1/driving"
_NOM_HDR       = {"User-Agent": "TravelPeru/2.2 oszeladap@gmail.com"}

# Top attraction per destination city (mirrors frontend TOP_ATTRACTION dict)
_TOP_ATTR: dict[str, str] = {
    "cusco":        "Sacsayhuaman",
    "machu picchu": "Machu Picchu Citadel",
    "lima":         "Larco Museum",
    "arequipa":     "Monastery of Santa Catalina",
    "puno":         "Mirador El Condor",
    "trujillo":     "Chan Chan",
    "iquitos":      "Belen Market",
    "huaraz":       "Llanganuco Lakes",
    "paracas":      "Paracas National Reserve",
    "nazca":        "Nazca Lines Viewpoint",
    "chiclayo":     "Huaca Rajada",
    "ayacucho":     "Wari Archaeological Site",
    "cajamarca":    "Cumbe Mayo",
    "tarapoto":     "Ahuashiyacu Waterfall",
    "tacna":        "Tacna Cathedral",
    "piura":        "Catedral de Piura",
    "huancayo":     "Huancayo Cathedral",
    "ica":          "Huacachina",
}


def _build_route_map_sync(coords: list[tuple], from_xy: tuple, to_xy: tuple) -> bytes:
    """Render a real OSM static map with route polyline. Runs in thread pool."""
    from staticmap import StaticMap, Line, CircleMarker
    m = StaticMap(
        640, 340,
        url_template="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        headers={"User-Agent": "TravelPeru/2.2 oszeladap@gmail.com"},
        tile_request_timeout=12,
    )
    if coords:
        m.add_line(Line(coords, "#1565A0", 4))
    m.add_marker(CircleMarker(from_xy, "#1E6DC8", 16))
    m.add_marker(CircleMarker(to_xy,   "#DC2626", 16))
    image = m.render()
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


async def _wiki_image(client: httpx.AsyncClient, page: str, size: int = 380) -> dict | None:
    """Fetch a Wikipedia page thumbnail via the REST Summary API (handles redirects automatically).

    Returns {title, data: 'data:image/jpeg;base64,...'} or None.
    The REST API returns thumbnail.source pointing to a Wikimedia image URL.
    Images may be WebP — the frontend must convert via Canvas before passing to jsPDF.
    """
    try:
        encoded = urllib.parse.quote(page.replace(" ", "_"), safe="")
        resp = await client.get(
            f"{_WIKI_REST}/{encoded}",
            headers=_IMG_HEADERS,
            timeout=10.0,
            follow_redirects=True,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        src = data.get("thumbnail", {}).get("source")
        if not src:
            return None
        img = await client.get(src, headers=_IMG_HEADERS, timeout=12.0, follow_redirects=True)
        if img.status_code != 200:
            return None
        ct = img.headers.get("content-type", "image/jpeg").split(";")[0]
        b64 = base64.b64encode(img.content).decode()
        return {"title": page, "data": f"data:{ct};base64,{b64}"}
    except Exception:
        return None


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


@app.get("/images/{destination}", tags=["utils"])
async def get_destination_images(destination: str) -> dict:
    """Fetch Wikipedia images for a Peru destination (server-side proxy to avoid CORS).

    Returns: {plaza, top, extras[]} each with {title, data: 'data:image/...;base64,...'}.
    """
    key = destination.lower().strip()
    info = _DEST_IMG_MAP.get(key, {
        "plaza": f"{destination} Peru",
        "top": destination,
        "extra": [f"{destination} Peru tourism"],
    })

    async with httpx.AsyncClient(headers=_IMG_HEADERS, follow_redirects=True) as client:
        plaza_img, top_img = await asyncio.gather(
            _wiki_image(client, info["plaza"]),
            _wiki_image(client, info["top"]),
        )
        extras: list[dict] = []
        for page in info.get("extra", [])[:4]:
            img = await _wiki_image(client, page)
            if img:
                extras.append(img)

    return {"plaza": plaza_img, "top": top_img, "extras": extras}


@app.get("/route-map/{destination}", tags=["utils"])
async def get_route_map(destination: str) -> dict:
    """Return a base64 PNG of the real OSM driving route from Plaza de Armas to the top attraction.

    Uses staticmap + OpenStreetMap tiles to render an actual street-level map.
    """
    key = destination.lower().strip()
    top_name = _TOP_ATTR.get(key)
    if not top_name:
        raise HTTPException(status_code=404, detail=f"No route map configured for '{destination}'.")

    from_q = f"Plaza de Armas {destination} Peru"
    to_q   = f"{top_name} {destination} Peru"

    try:
        async with httpx.AsyncClient(headers=_NOM_HDR, timeout=10.0) as client:
            r1_resp, r2_resp = await asyncio.gather(
                client.get(_NOMINATIM_URL, params={"q": from_q, "format": "json", "limit": 1, "countrycodes": "pe"}),
                client.get(_NOMINATIM_URL, params={"q": to_q,   "format": "json", "limit": 1, "countrycodes": "pe"}),
            )
        r1 = r1_resp.json()
        r2 = r2_resp.json()
        if not r1 or not r2:
            raise ValueError("Geocoding returned no results")

        lon1, lat1 = float(r1[0]["lon"]), float(r1[0]["lat"])
        lon2, lat2 = float(r2[0]["lon"]), float(r2[0]["lat"])

        async with httpx.AsyncClient(timeout=12.0) as client:
            route_resp = await client.get(
                f"{_OSRM_DRIVE}/{lon1},{lat1};{lon2},{lat2}",
                params={"overview": "full", "geometries": "geojson"},
            )
        route_data = route_resp.json()

        coords: list[tuple] = []
        walk_dist = walk_dur = 0
        if route_data.get("code") == "Ok":
            route = route_data["routes"][0]
            coords = [(c[0], c[1]) for c in route["geometry"]["coordinates"]]
            walk_dist = round(route["distance"])
            walk_dur  = round(route["duration"] / 60)

        # Render map in thread pool (staticmap is synchronous)
        loop = asyncio.get_running_loop()
        img_bytes = await loop.run_in_executor(
            None, _build_route_map_sync, coords, (lon1, lat1), (lon2, lat2)
        )
        b64 = base64.b64encode(img_bytes).decode()
        return {
            "image":      f"data:image/png;base64,{b64}",
            "from_label": from_q,
            "to_label":   to_q,
            "top_name":   top_name,
            "dist_m":     walk_dist,
            "dur_min":    walk_dur,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Route map generation failed: {exc}")


@app.post(
    "/chat",
    response_model=ChatResponse,
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user", "admin"]))],
)
def chat(
    body: ChatRequest,
    user: CurrentUser,
) -> ChatResponse:
    """Send a message to the agent and persist both turns to Firestore.

    Requires role: ``assistant_user`` or ``admin``.
    """
    uid = user["uid"]
    # chat_id is date-based (YYYYMMDD_HHmmss_mmm), generated by frontend on "New Chat"
    chat_id = body.chat_id or datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_000")

    # Update last login timestamp
    fs.touch_last_login(uid=uid, email=user.get("email", ""))

    # Retrieve history for this specific chat (conversation context)
    history = fs.get_chat_messages(uid, chat_id)

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
        fs.save_chat_message(uid=uid, chat_id=chat_id, role="user", content=body.message, tokens=0)
        fs.save_chat_message(uid=uid, chat_id=chat_id, role="assistant", content=reply, tokens=tokens)
    except Exception as exc:
        print(f"[main] Firestore write error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo guardar el historial. El mensaje fue procesado.",
        )

    return ChatResponse(
        reply=reply,
        chat_id=chat_id,
        tokens_used=tokens,
        used_search=used_search,
    )


@app.get(
    "/history",
    response_model=HistoryResponse,
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user", "viewer", "admin"]))],
)
def get_history(
    user: CurrentUser,
    uid: Annotated[str | None, Query(description="UID objetivo (admin/viewer pueden inspeccionar cualquier sesión)")] = None,
) -> HistoryResponse:
    """Return the full message history for a user session.

    - ``assistant_user``: always receives their own history (``uid`` param ignored).
    - ``viewer`` / ``admin``: can pass a ``uid`` query param; defaults to own history.
    """
    role = user.get("role")
    target_uid: str

    if role == "assistant_user":
        target_uid = user["uid"]
    elif uid:
        target_uid = uid
    else:
        # admin/viewer with no uid → show own history
        target_uid = user["uid"]

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
    dependencies=[Depends(require_role(["assistant_user", "admin"]))],
)
def delete_history(user: CurrentUser) -> DeleteResponse:
    """Clear message history while preserving the user profile.

    Requires role: ``assistant_user`` or ``admin``.
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


# ---------------------------------------------------------------------------
# Chat endpoints  (subcollection-based: sessions/{uid}/chats/{chat_id})
# ---------------------------------------------------------------------------

@app.get(
    "/chats",
    response_model=ChatListResponse,
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user", "viewer", "admin"]))],
)
def list_chats(user: CurrentUser) -> ChatListResponse:
    """Return list of all chats for the authenticated user, newest first."""
    try:
        chats = fs.list_chats(user["uid"])
    except Exception as exc:
        print(f"[main] list_chats error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo obtener la lista de chats.",
        )
    return ChatListResponse(chats=chats, total_chats=len(chats))


@app.get(
    "/chats/{chat_id}",
    response_model=ChatHistoryResponse,
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user", "viewer", "admin"]))],
)
def get_chat(chat_id: str, user: CurrentUser) -> ChatHistoryResponse:
    """Return messages for a specific chat."""
    try:
        messages = fs.get_chat_messages(user["uid"], chat_id)
    except Exception as exc:
        print(f"[main] get_chat error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo obtener el chat.",
        )
    return ChatHistoryResponse(messages=messages, chat_id=chat_id)


@app.delete(
    "/chats/{chat_id}",
    response_model=DeleteResponse,
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user", "admin"]))],
)
def delete_one_chat(chat_id: str, user: CurrentUser) -> DeleteResponse:
    """Delete a specific chat."""
    try:
        fs.delete_chat(user["uid"], chat_id)
    except Exception as exc:
        print(f"[main] delete_chat error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo eliminar el chat.",
        )
    return DeleteResponse(message="Chat eliminado.")


@app.delete(
    "/chats",
    response_model=DeleteResponse,
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user", "admin"]))],
)
def delete_all_chats_endpoint(user: CurrentUser) -> DeleteResponse:
    """Delete all chats for the authenticated user."""
    try:
        fs.delete_all_chats(user["uid"])
    except Exception as exc:
        print(f"[main] delete_all_chats error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo eliminar los chats.",
        )
    return DeleteResponse(message="Todos los chats eliminados.")


@app.post(
    "/summary",
    tags=["chat"],
    dependencies=[Depends(require_role(["assistant_user", "admin"]))],
)
def create_summary(body: SummaryRequest, user: CurrentUser) -> dict:
    """Generate an AI-structured summary of a chat for the executive PDF.

    Calls Mistral with a structured extraction prompt and returns JSON with
    destino, clima, costos (economico/comodo), lugares and consejos.
    """
    try:
        messages = fs.get_chat_messages(user["uid"], body.chat_id)
    except Exception as exc:
        print(f"[main] get_chat_messages for summary error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo obtener los mensajes del chat.",
        )

    if not messages:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat no encontrado o sin mensajes.",
        )

    return agent_module.generate_summary(messages)


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
    dependencies=[Depends(require_role(["assistant_user", "admin"]))],
)
def update_profile(body: ProfileUpdateRequest, user: CurrentUser) -> ProfileResponse:
    """Update editable profile fields (nombre, preferencias, notas).

    Requires role: ``assistant_user`` or ``admin``.
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


@app.get(
    "/admin/users",
    response_model=AdminUsersResponse,
    tags=["admin"],
    dependencies=[Depends(require_role(["admin"]))],
)
def admin_list_users() -> AdminUsersResponse:
    """Return all Firebase Auth users with their roles. Requires role: ``admin``."""
    try:
        users = list_firebase_users()
    except Exception as exc:
        print(f"[main] Firebase list_users error: {exc}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="No se pudo obtener la lista de usuarios.")
    return AdminUsersResponse(users=users, total_users=len(users))


@app.put(
    "/admin/users/{uid}/role",
    response_model=DeleteResponse,
    tags=["admin"],
    dependencies=[Depends(require_role(["admin"]))],
)
def admin_update_role(uid: str, body: UserRoleUpdateRequest, user: CurrentUser) -> DeleteResponse:
    """Assign or clear a role for a Firebase user. Requires role: ``admin``."""
    if uid == user["uid"] and not body.role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="No puedes quitarte el rol a ti mismo.")
    valid = {"assistant_user", "viewer", "admin", None}
    if body.role not in valid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Rol inválido: {body.role!r}. Válidos: assistant_user, viewer, admin.")
    try:
        set_user_role(uid, body.role)
    except Exception as exc:
        print(f"[main] set_user_role error: {exc}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="No se pudo actualizar el rol.")
    return DeleteResponse(message="Rol actualizado correctamente.")


@app.delete(
    "/admin/users/{uid}",
    response_model=DeleteResponse,
    tags=["admin"],
    dependencies=[Depends(require_role(["admin"]))],
)
def admin_delete_user(uid: str, user: CurrentUser) -> DeleteResponse:
    """Permanently delete a Firebase Auth user. Requires role: ``admin``."""
    if uid == user["uid"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="No puedes eliminar tu propia cuenta.")
    try:
        delete_firebase_user(uid)
        fs.clear_session(uid)
    except Exception as exc:
        print(f"[main] delete_user error: {exc}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="No se pudo eliminar el usuario.")
    return DeleteResponse(message="Usuario eliminado correctamente.")


# ---------------------------------------------------------------------------
# Static files — prefer built React dist, fall back to raw frontend dir
# Must be mounted LAST so API routes take priority.
# html=True enables SPA fallback (all unknown paths serve index.html).
# No-cache for HTML is handled by _NoCacheHtmlMiddleware above.
# ---------------------------------------------------------------------------
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
_frontend_src = Path(__file__).parent.parent / "frontend"
_serve_dir = _frontend_dist if _frontend_dist.exists() else _frontend_src

app.add_middleware(_NoCacheHtmlMiddleware)

if _serve_dir.exists():
    app.mount("/", StaticFiles(directory=str(_serve_dir), html=True), name="frontend")
