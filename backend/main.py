from __future__ import annotations

import asyncio
import base64
import io
import os
import tempfile
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
# Destination images — hardcoded Wikimedia CDN URLs (verified locally, stable).
# NO Wikipedia API calls at runtime → zero rate-limiting risk on Railway.
# Each city has exactly 6 images: [city, top-attraction, gastro1, gastro2, site1, site2].
# The browser loads images directly from upload.wikimedia.org (CORS: Access-Control-Allow-Origin: *).
# ---------------------------------------------------------------------------

_W = "https://upload.wikimedia.org/wikipedia/commons/thumb"
_WE = "https://upload.wikimedia.org/wikipedia/en"

_DEST_IMGS: dict[str, list[dict]] = {
    "cusco": [
        {"title": "Cusco",           "url": f"{_W}/d/d7/Vista_Calle_Suecia.jpg/640px-Vista_Calle_Suecia.jpg"},
        {"title": "Machu Picchu",    "url": f"{_W}/b/bb/Machu_Picchu%2C_2023_%28012%29.jpg/640px-Machu_Picchu%2C_2023_%28012%29.jpg"},
        {"title": "Gastronomia andina", "url": f"{_W}/5/57/PachaComer.jpg/640px-PachaComer.jpg"},
        {"title": "Chicharron",      "url": f"{_W}/2/26/Anticuchos_-_Grilled_Beef_Heart_skewers.jpg/640px-Anticuchos_-_Grilled_Beef_Heart_skewers.jpg"},
        {"title": "Sacsayhuaman",    "url": f"{_W}/6/60/Sacsayhuam%C3%A1n%2C_Cusco%2C_Per%C3%BA%2C_2015-07-31%2C_DD_27.JPG/640px-Sacsayhuam%C3%A1n%2C_Cusco%2C_Per%C3%BA%2C_2015-07-31%2C_DD_27.JPG"},
        {"title": "Qorikancha",      "url": f"{_W}/d/dd/Coricancha%2C_Cusco%2C_Per%C3%BA%2C_2015-07-31%2C_DD_68.JPG/640px-Coricancha%2C_Cusco%2C_Per%C3%BA%2C_2015-07-31%2C_DD_68.JPG"},
    ],
    "machu picchu": [
        {"title": "Aguas Calientes", "url": f"{_W}/a/ac/Aguas_Calientes%2C_Cuzco%2C_Per%C3%BA%2C_2015-07-30%2C_DD_68.JPG/640px-Aguas_Calientes%2C_Cuzco%2C_Per%C3%BA%2C_2015-07-30%2C_DD_68.JPG"},
        {"title": "Machu Picchu",    "url": f"{_W}/b/bb/Machu_Picchu%2C_2023_%28012%29.jpg/640px-Machu_Picchu%2C_2023_%28012%29.jpg"},
        {"title": "Ceviche",         "url": f"{_W}/7/78/Cebiche_de_corvina.JPG/640px-Cebiche_de_corvina.JPG"},
        {"title": "Anticuchos",      "url": f"{_W}/2/26/Anticuchos_-_Grilled_Beef_Heart_skewers.jpg/640px-Anticuchos_-_Grilled_Beef_Heart_skewers.jpg"},
        {"title": "Camino Inca",     "url": f"{_W}/2/29/Incatrail_in_Peru.jpg/640px-Incatrail_in_Peru.jpg"},
        {"title": "Ollantaytambo",   "url": f"{_W}/9/91/Ollantaytambo_-_Heiliges_Tal.jpg/640px-Ollantaytambo_-_Heiliges_Tal.jpg"},
    ],
    "lima": [
        {"title": "Lima",            "url": f"{_W}/6/69/Bas%C3%ADlica_Catedral_Metropolitana_de_Lima_%28cropped%29.jpg/640px-Bas%C3%ADlica_Catedral_Metropolitana_de_Lima_%28cropped%29.jpg"},
        {"title": "Museo Larco",     "url": f"{_W}/c/c7/Lima_museo_larco.jpg/640px-Lima_museo_larco.jpg"},
        {"title": "Ceviche",         "url": f"{_W}/7/78/Cebiche_de_corvina.JPG/640px-Cebiche_de_corvina.JPG"},
        {"title": "Lomo saltado",    "url": f"{_W}/8/80/Lomo_Saltado_-_Lima%2C_Peru_Miraflores_%28Tiendecita_Blanca%29.jpg/640px-Lomo_Saltado_-_Lima%2C_Peru_Miraflores_%28Tiendecita_Blanca%29.jpg"},
        {"title": "Miraflores",      "url": f"{_W}/e/ef/Miraflores_2023.jpg/640px-Miraflores_2023.jpg"},
        {"title": "Huaca Pucllana",  "url": f"{_W}/d/de/Huaca_Pucllana_Miraflores.jpg/640px-Huaca_Pucllana_Miraflores.jpg"},
    ],
    "arequipa": [
        {"title": "Arequipa",        "url": f"{_W}/5/5f/Catedral_Arequipa%2C_Peru.jpg/640px-Catedral_Arequipa%2C_Peru.jpg"},
        {"title": "Canon del Colca", "url": f"{_W}/1/13/Colca_Canyon_Puno.jpg/640px-Colca_Canyon_Puno.jpg"},
        {"title": "Rocoto relleno",  "url": f"{_W}/1/17/Rocoto_relleno.jpg/640px-Rocoto_relleno.jpg"},
        {"title": "Aji de gallina",  "url": f"{_W}/e/e1/Aj%C3%AD_de_gallina.jpg/640px-Aj%C3%AD_de_gallina.jpg"},
        {"title": "Monasterio Santa Catalina", "url": f"{_W}/5/5c/Santa_Catalina_Monastery%2C_Arequipa_-_53032077180.jpg/640px-Santa_Catalina_Monastery%2C_Arequipa_-_53032077180.jpg"},
        {"title": "Volcan El Misti", "url": f"{_W}/a/a3/Volcano_Misti%2C_Peru.jpg/640px-Volcano_Misti%2C_Peru.jpg"},
    ],
    "puno": [
        {"title": "Puno",            "url": f"{_W}/0/00/Vista_de_Puno_y_el_Titicaca%2C_Per%C3%BA%2C_2015-08-01%2C_DD_63.JPG/640px-Vista_de_Puno_y_el_Titicaca%2C_Per%C3%BA%2C_2015-08-01%2C_DD_63.JPG"},
        {"title": "Lago Titicaca",   "url": f"{_W}/7/73/Lake_Titicaca_ESA22522896.jpeg/640px-Lake_Titicaca_ESA22522896.jpeg"},
        {"title": "Cocina andina",   "url": f"{_W}/5/57/PachaComer.jpg/640px-PachaComer.jpg"},
        {"title": "Pachamanca",      "url": f"{_W}/5/57/PachaComer.jpg/640px-PachaComer.jpg"},
        {"title": "Sillustani",      "url": f"{_W}/4/49/Sillustani%2C_Per%C3%BA%2C_2015-08-01%2C_DD_87.JPG/640px-Sillustani%2C_Per%C3%BA%2C_2015-08-01%2C_DD_87.JPG"},
        {"title": "Isla Taquile",    "url": f"{_W}/a/a1/Taquile_from_Amantani.jpg/640px-Taquile_from_Amantani.jpg"},
    ],
    "trujillo": [
        {"title": "Trujillo",        "url": f"{_W}/e/ed/Freedom_Monument%2C_Trujillo.jpg/640px-Freedom_Monument%2C_Trujillo.jpg"},
        {"title": "Chan Chan",       "url": f"{_W}/e/e0/Chan_chan_view1.jpg/640px-Chan_chan_view1.jpg"},
        {"title": "Ceviche",         "url": f"{_W}/7/78/Cebiche_de_corvina.JPG/640px-Cebiche_de_corvina.JPG"},
        {"title": "Anticuchos",      "url": f"{_W}/2/26/Anticuchos_-_Grilled_Beef_Heart_skewers.jpg/640px-Anticuchos_-_Grilled_Beef_Heart_skewers.jpg"},
        {"title": "Senor de Sipan",  "url": f"{_W}/3/3d/Se%C3%B1or_de_S%C3%ADpan_-_Reconstrucci%C3%B3n_Facial_Forense.jpg/640px-Se%C3%B1or_de_S%C3%ADpan_-_Reconstrucci%C3%B3n_Facial_Forense.jpg"},
        {"title": "Huaca de la Luna","url": f"{_W}/2/21/Huaca_de_la_Luna_jt02.jpg/640px-Huaca_de_la_Luna_jt02.jpg"},
    ],
    "iquitos": [
        {"title": "Iquitos",         "url": f"{_W}/1/1f/Plaza_de_Armas_en_Iquitos.jpg/640px-Plaza_de_Armas_en_Iquitos.jpg"},
        {"title": "Rio Amazonas",    "url": f"{_W}/f/f8/Amazon_River_ESA387332.jpg/640px-Amazon_River_ESA387332.jpg"},
        {"title": "Lomo saltado",    "url": f"{_W}/8/80/Lomo_Saltado_-_Lima%2C_Peru_Miraflores_%28Tiendecita_Blanca%29.jpg/640px-Lomo_Saltado_-_Lima%2C_Peru_Miraflores_%28Tiendecita_Blanca%29.jpg"},
        {"title": "Amazonia peruana","url": f"{_W}/1/13/7_-_Itahuania_-_Ao%C3%BBt_2008.JPG/640px-7_-_Itahuania_-_Ao%C3%BBt_2008.JPG"},
        {"title": "Selva amazonica", "url": f"{_W}/5/56/Amazon17_%285641020319%29.jpg/640px-Amazon17_%285641020319%29.jpg"},
        {"title": "Cuenca amazonica","url": f"{_W}/0/02/Amazonriverbasin_basemap.png/640px-Amazonriverbasin_basemap.png"},
    ],
    "huaraz": [
        {"title": "Huaraz",          "url": f"{_W}/2/2f/Huascaran_Huandoy_Chopicalqui_seen_from_Huaraz.JPG/640px-Huascaran_Huandoy_Chopicalqui_seen_from_Huaraz.JPG"},
        {"title": "Nevado Huascaran","url": f"{_W}/5/59/Nevado_Huascar%C3%A1n3.jpg/640px-Nevado_Huascar%C3%A1n3.jpg"},
        {"title": "Cocina andina",   "url": f"{_W}/5/57/PachaComer.jpg/640px-PachaComer.jpg"},
        {"title": "Anticuchos",      "url": f"{_W}/2/26/Anticuchos_-_Grilled_Beef_Heart_skewers.jpg/640px-Anticuchos_-_Grilled_Beef_Heart_skewers.jpg"},
        {"title": "Lagunas Llanganuco","url": f"{_W}/e/e1/Heaven%27s_Gate_Laguna_de_Chinancocha_02.jpg/640px-Heaven%27s_Gate_Laguna_de_Chinancocha_02.jpg"},
        {"title": "Cordillera Blanca","url": f"{_W}/9/96/Beauty_of_mount_Huandoy%2C_Cordillera_Blanca%2C_Ancash%2C_Peru.jpg/640px-Beauty_of_mount_Huandoy%2C_Cordillera_Blanca%2C_Ancash%2C_Peru.jpg"},
    ],
    "paracas": [
        {"title": "Reserva Paracas", "url": f"{_W}/f/f4/Paracas_National_Reserve._Ica%2C_Peru.jpg/640px-Paracas_National_Reserve._Ica%2C_Peru.jpg"},
        {"title": "Islas Ballestas", "url": f"{_W}/0/0e/Islas_Ballestas_-_panoramio_%283%29.jpg/640px-Islas_Ballestas_-_panoramio_%283%29.jpg"},
        {"title": "Pisco sour",      "url": f"{_W}/2/27/Pisco_sour_20100613b.JPG/640px-Pisco_sour_20100613b.JPG"},
        {"title": "Ceviche",         "url": f"{_W}/7/78/Cebiche_de_corvina.JPG/640px-Cebiche_de_corvina.JPG"},
        {"title": "Huacachina",      "url": f"{_W}/d/d4/Oasis_de_Huacachina%2C_Ica%2C_Per%C3%BA%2C_2015-07-29%2C_DD_18.JPG/640px-Oasis_de_Huacachina%2C_Ica%2C_Per%C3%BA%2C_2015-07-29%2C_DD_18.JPG"},
        {"title": "Chincha Alta",    "url": f"{_W}/7/73/Chincha_Alta%2C_Ica.png/640px-Chincha_Alta%2C_Ica.png"},
    ],
    "nazca": [
        {"title": "Nazca",           "url": f"{_W}/9/9a/Plaza_de_Armas%2C_Nazca_%288443289015%29.jpg/640px-Plaza_de_Armas%2C_Nazca_%288443289015%29.jpg"},
        {"title": "Lineas de Nazca", "url": f"{_W}/f/f7/L%C3%ADneas_de_Nazca%2C_Nazca%2C_Per%C3%BA%2C_2015-07-29%2C_DD_49.JPG/640px-L%C3%ADneas_de_Nazca%2C_Nazca%2C_Per%C3%BA%2C_2015-07-29%2C_DD_49.JPG"},
        {"title": "Ceviche",         "url": f"{_W}/7/78/Cebiche_de_corvina.JPG/640px-Cebiche_de_corvina.JPG"},
        {"title": "Tiradito",        "url": f"{_W}/1/18/Tiradito.jpg/640px-Tiradito.jpg"},
        {"title": "Maria Reiche",    "url": f"{_WE}/e/e1/Maria_Reiche_1986.jpg"},
        {"title": "Tambo Colorado",  "url": f"{_W}/7/71/TamboColorado-colours.PNG/640px-TamboColorado-colours.PNG"},
    ],
    "chiclayo": [
        {"title": "Chiclayo",        "url": f"{_W}/e/e5/Chiclayo-Peru3.jpg/640px-Chiclayo-Peru3.jpg"},
        {"title": "Huaca Rajada",    "url": f"{_W}/9/93/Tomb_of_Lord_of_Sip%C3%A1n_01.jpg/640px-Tomb_of_Lord_of_Sip%C3%A1n_01.jpg"},
        {"title": "Ceviche",         "url": f"{_W}/7/78/Cebiche_de_corvina.JPG/640px-Cebiche_de_corvina.JPG"},
        {"title": "Anticuchos",      "url": f"{_W}/2/26/Anticuchos_-_Grilled_Beef_Heart_skewers.jpg/640px-Anticuchos_-_Grilled_Beef_Heart_skewers.jpg"},
        {"title": "Senor de Sipan",  "url": f"{_W}/3/3d/Se%C3%B1or_de_S%C3%ADpan_-_Reconstrucci%C3%B3n_Facial_Forense.jpg/640px-Se%C3%B1or_de_S%C3%ADpan_-_Reconstrucci%C3%B3n_Facial_Forense.jpg"},
        {"title": "Huaca de la Luna","url": f"{_W}/2/21/Huaca_de_la_Luna_jt02.jpg/640px-Huaca_de_la_Luna_jt02.jpg"},
    ],
    "ayacucho": [
        {"title": "Ayacucho",        "url": f"{_W}/8/85/Catedral_de_Ayacucho_%28Catedral_Bas%C3%ADlica_de_Santa_Mar%C3%ADa%29.jpg/640px-Catedral_de_Ayacucho_%28Catedral_Bas%C3%ADlica_de_Santa_Mar%C3%ADa%29.jpg"},
        {"title": "Imperio Wari",    "url": f"{_W}/8/8b/Map_of_Wari_and_Tiawaku.svg/640px-Map_of_Wari_and_Tiawaku.svg.png"},
        {"title": "Cocina andina",   "url": f"{_W}/5/57/PachaComer.jpg/640px-PachaComer.jpg"},
        {"title": "Pachamanca",      "url": f"{_W}/5/57/PachaComer.jpg/640px-PachaComer.jpg"},
        {"title": "Batalla Ayacucho","url": f"{_W}/d/df/Batalla_de_Ayacucho_by_Mart%C3%ADn_Tovar_y_Tovar_%281827_-_1902%29.jpg/640px-Batalla_de_Ayacucho_by_Mart%C3%ADn_Tovar_y_Tovar_%281827_-_1902%29.jpg"},
        {"title": "Ventanillas Otuzco","url": f"{_W}/5/5c/Otuzco.jpg/640px-Otuzco.jpg"},
    ],
    "cajamarca": [
        {"title": "Cajamarca",       "url": f"{_W}/9/93/Catedral_de_Cajamarca_Per%C3%BA.jpg/640px-Catedral_de_Cajamarca_Per%C3%BA.jpg"},
        {"title": "Cumbe Mayo",      "url": f"{_W}/9/9c/Cumbemayo_aqueduct.JPG/640px-Cumbemayo_aqueduct.JPG"},
        {"title": "Cocina andina",   "url": f"{_W}/5/57/PachaComer.jpg/640px-PachaComer.jpg"},
        {"title": "Papa a la huancaina","url": f"{_W}/7/74/Papa_a_la_huancaina.jpg/640px-Papa_a_la_huancaina.jpg"},
        {"title": "Ventanillas Otuzco","url": f"{_W}/5/5c/Otuzco.jpg/640px-Otuzco.jpg"},
        {"title": "Barranco Lima",   "url": f"{_W}/d/d7/Barranco_District_Lima_Peru.jpg/640px-Barranco_District_Lima_Peru.jpg"},
    ],
    "tarapoto": [
        {"title": "Tarapoto",        "url": f"{_W}/a/a7/Puente_Atumpampa%2C_Tarapoto.jpg/640px-Puente_Atumpampa%2C_Tarapoto.jpg"},
        {"title": "Selva amazonica", "url": f"{_W}/5/56/Amazon17_%285641020319%29.jpg/640px-Amazon17_%285641020319%29.jpg"},
        {"title": "Lomo saltado",    "url": f"{_W}/8/80/Lomo_Saltado_-_Lima%2C_Peru_Miraflores_%28Tiendecita_Blanca%29.jpg/640px-Lomo_Saltado_-_Lima%2C_Peru_Miraflores_%28Tiendecita_Blanca%29.jpg"},
        {"title": "Amazonia peruana","url": f"{_W}/1/13/7_-_Itahuania_-_Ao%C3%BBt_2008.JPG/640px-7_-_Itahuania_-_Ao%C3%BBt_2008.JPG"},
        {"title": "Region San Martin","url": f"{_W}/2/2b/Riu_Huallaga_des_de_la_carretera_de_Sauce04.jpg/640px-Riu_Huallaga_des_de_la_carretera_de_Sauce04.jpg"},
        {"title": "Rio Amazonas",    "url": f"{_W}/f/f8/Amazon_River_ESA387332.jpg/640px-Amazon_River_ESA387332.jpg"},
    ],
    "tacna": [
        {"title": "Tacna",           "url": f"{_W}/e/e6/Catedral_Nuestra_Se%C3%B1ora_del_Rosario_de_Tacna.jpg/640px-Catedral_Nuestra_Se%C3%B1ora_del_Rosario_de_Tacna.jpg"},
        {"title": "Catedral de Tacna","url": f"{_W}/e/e6/Catedral_Nuestra_Se%C3%B1ora_del_Rosario_de_Tacna.jpg/640px-Catedral_Nuestra_Se%C3%B1ora_del_Rosario_de_Tacna.jpg"},
        {"title": "Ceviche",         "url": f"{_W}/7/78/Cebiche_de_corvina.JPG/640px-Cebiche_de_corvina.JPG"},
        {"title": "Aji de gallina",  "url": f"{_W}/e/e1/Aj%C3%AD_de_gallina.jpg/640px-Aj%C3%AD_de_gallina.jpg"},
        {"title": "Region Tacna",    "url": f"{_W}/2/2c/Tutupaca2.jpg/640px-Tutupaca2.jpg"},
        {"title": "Volcan El Misti", "url": f"{_W}/a/a3/Volcano_Misti%2C_Peru.jpg/640px-Volcano_Misti%2C_Peru.jpg"},
    ],
    "piura": [
        {"title": "Piura",           "url": f"{_W}/6/65/PLAZA_DE_ARMAS_DE_PIURA_-_PIURA.jpg/640px-PLAZA_DE_ARMAS_DE_PIURA_-_PIURA.jpg"},
        {"title": "Playa Mancora",   "url": f"{_W}/6/65/Mancorabeach1.jpg/640px-Mancorabeach1.jpg"},
        {"title": "Ceviche",         "url": f"{_W}/7/78/Cebiche_de_corvina.JPG/640px-Cebiche_de_corvina.JPG"},
        {"title": "Tiradito",        "url": f"{_W}/1/18/Tiradito.jpg/640px-Tiradito.jpg"},
        {"title": "Catacaos",        "url": f"{_W}/d/db/Iglesia_San_Juan_Bautista%2C_Catacaos_01.jpg/640px-Iglesia_San_Juan_Bautista%2C_Catacaos_01.jpg"},
        {"title": "Huancabamba",     "url": f"{_W}/d/db/Huancabamba_aerialview.jpg/640px-Huancabamba_aerialview.jpg"},
    ],
    "huancayo": [
        {"title": "Huancayo",        "url": f"{_W}/f/fd/Plaza_de_la_Constituci%C3%B3n_Huancayo.jpg/640px-Plaza_de_la_Constituci%C3%B3n_Huancayo.jpg"},
        {"title": "Lagunas Llanganuco","url": f"{_W}/e/e1/Heaven%27s_Gate_Laguna_de_Chinancocha_02.jpg/640px-Heaven%27s_Gate_Laguna_de_Chinancocha_02.jpg"},
        {"title": "Cocina andina",   "url": f"{_W}/5/57/PachaComer.jpg/640px-PachaComer.jpg"},
        {"title": "Pachamanca",      "url": f"{_W}/5/57/PachaComer.jpg/640px-PachaComer.jpg"},
        {"title": "Papa a la huancaina","url": f"{_W}/7/74/Papa_a_la_huancaina.jpg/640px-Papa_a_la_huancaina.jpg"},
        {"title": "Cordillera Blanca","url": f"{_W}/9/96/Beauty_of_mount_Huandoy%2C_Cordillera_Blanca%2C_Ancash%2C_Peru.jpg/640px-Beauty_of_mount_Huandoy%2C_Cordillera_Blanca%2C_Ancash%2C_Peru.jpg"},
    ],
    "ica": [
        {"title": "Ica",             "url": f"{_W}/4/4c/Oasis_de_Huacachina%2C_Ica%2C_Per%C3%BA%2C_2015-07-29%2C_DD_23.JPG/640px-Oasis_de_Huacachina%2C_Ica%2C_Per%C3%BA%2C_2015-07-29%2C_DD_23.JPG"},
        {"title": "Huacachina",      "url": f"{_W}/d/d4/Oasis_de_Huacachina%2C_Ica%2C_Per%C3%BA%2C_2015-07-29%2C_DD_18.JPG/640px-Oasis_de_Huacachina%2C_Ica%2C_Per%C3%BA%2C_2015-07-29%2C_DD_18.JPG"},
        {"title": "Pisco sour",      "url": f"{_W}/2/27/Pisco_sour_20100613b.JPG/640px-Pisco_sour_20100613b.JPG"},
        {"title": "Tiradito",        "url": f"{_W}/1/18/Tiradito.jpg/640px-Tiradito.jpg"},
        {"title": "Chincha Alta",    "url": f"{_W}/7/73/Chincha_Alta%2C_Ica.png/640px-Chincha_Alta%2C_Ica.png"},
        {"title": "Tambo Colorado",  "url": f"{_W}/7/71/TamboColorado-colours.PNG/640px-TamboColorado-colours.PNG"},
    ],
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
def get_destination_images(destination: str) -> dict:
    """Return hardcoded Wikimedia CDN image URLs for a Peru destination.

    No Wikipedia API calls — zero rate-limiting risk on Railway.
    Returns: {plaza, top, extras[]} where each value is {title, url} or null.
    """
    key  = destination.lower().strip()
    imgs = _DEST_IMGS.get(key, [])
    return {
        "plaza":  imgs[0] if len(imgs) > 0 else None,
        "top":    imgs[1] if len(imgs) > 1 else None,
        "extras": imgs[2:6],
    }


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
            r1_resp = await client.get(_NOMINATIM_URL, params={"q": from_q, "format": "json", "limit": 1, "countrycodes": "pe"})
            await asyncio.sleep(1.1)  # Nominatim ToS: max 1 req/sec
            r2_resp = await client.get(_NOMINATIM_URL, params={"q": to_q,   "format": "json", "limit": 1, "countrycodes": "pe"})
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
