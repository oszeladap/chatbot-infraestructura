from __future__ import annotations

import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_mistralai import ChatMistralAI
from tavily import TavilyClient

SYSTEM_PROMPT = """Eres un asistente especializado en transporte en Perú.

Tu perfil:
- Experto en servicios de transporte aéreo y terrestre en Perú.
- Aerolíneas operativas: LATAM Perú, Sky Airline, Avianca, JetSmart, Star Perú.
- Operadores terrestres: Cruz del Sur, Oltursa, Tepsa, Civa, Móvil Tours, Ittsa, Flores Hermanos.
- Conoces aeropuertos, terminales terrestres, rutas y destinos en todo el Perú.
- Respondes siempre en español de forma clara y concisa.
- Adapta el nivel de detalle al conocimiento del usuario.

Cuando se te proporcione contexto de búsqueda web:
- Úsalo para enriquecer tu respuesta con información actualizada.
- Cita las fuentes con el formato: [Fuente: <url>].

Cuando se proporcione información meteorológica:
- Inclúyela en tu respuesta si es relevante para el viaje o destino consultado.
- Advierte sobre condiciones climáticas adversas que puedan afectar el transporte.

Formato de respuesta:
- Usa markdown cuando sea útil (listas, tablas, bloques de código).
- Sé directo: no repitas la pregunta ni añadas relleno."""

_PERU_CITIES = {
    "lima", "cusco", "arequipa", "trujillo", "chiclayo", "iquitos",
    "piura", "huancayo", "puno", "cajamarca", "tacna", "ica",
    "ayacucho", "huaraz", "moquegua", "tumbes", "tarapoto", "juliaca",
    "puerto maldonado", "chimbote", "paracas", "nazca", "tingo maria",
    "pucallpa", "sullana", "huanuco", "abancay",
}

_SEARCH_KEYWORDS = (
    # Time-sensitive / prices
    "último", "última", "últimos", "reciente", "ahora", "hoy", "actual",
    "precio", "costo", "tarifa", "pasaje", "boleto", "oferta", "promoción",
    "novedad", "2024", "2025", "2026",
    # Air transport
    "vuelo", "avión", "aerolínea", "aeropuerto", "aerolinea",
    "latam", "sky", "avianca", "jetsmart", "star peru",
    # Ground transport
    "bus", "terminal", "ruta", "horario", "salida", "llegada",
    "cruz del sur", "oltursa", "tepsa", "civa", "movil tours", "ittsa", "flores",
    # Rail
    "tren", "machu picchu", "inca rail", "andean explorer", "perurail",
    # Travel
    "viaje", "destino", "itinerario", "escala", "conexion",
    # Weather
    "clima", "tiempo", "lluvia", "temperatura", "sol", "niebla", "neblina",
    # Cities (flattened from set — order is non-deterministic but only membership is checked)
    *_PERU_CITIES,
)


@lru_cache(maxsize=1)
def _get_llm() -> ChatMistralAI:
    return ChatMistralAI(
        model="mistral-large-latest",
        temperature=0.3,
        api_key=os.environ["MISTRAL_API_KEY"],
    )


@lru_cache(maxsize=1)
def _get_tavily() -> TavilyClient:
    return TavilyClient(api_key=os.environ["TAVILY_API_KEY"])


def _needs_search(message: str) -> bool:
    low = message.lower()
    return any(kw in low for kw in _SEARCH_KEYWORDS)


def _extract_location(message: str) -> str:
    """Return the most specific Peru city found in the message, defaulting to Lima."""
    low = message.lower()
    for city in sorted(_PERU_CITIES, key=len, reverse=True):
        if city in low:
            return city.title()
    return "Lima"


def _search_transport(message: str) -> str:
    """Search Tavily focused on Peru air and ground transport services."""
    query = f"{message} transporte Peru aereo terrestre"
    try:
        results = _get_tavily().search(query, max_results=3)
        snippets = [
            f"- {r['content']} [Fuente: {r['url']}]"
            for r in results.get("results", [])
            if r.get("content")
        ]
        return "\n".join(snippets)
    except Exception as exc:
        print(f"[agent] Tavily transport search error (non-fatal): {exc}")
        return ""


def _search_weather(location: str) -> str:
    """Fetch current weather for a Peru location (defaults to Lima and today's date)."""
    today = datetime.now(timezone.utc).strftime("%d de %B de %Y")
    query = f"clima tiempo meteorologico {location} Peru hoy {today}"
    try:
        results = _get_tavily().search(query, max_results=2)
        snippets = [
            f"- {r['content']} [Fuente: {r['url']}]"
            for r in results.get("results", [])
            if r.get("content")
        ]
        return "\n".join(snippets)
    except Exception as exc:
        print(f"[agent] Tavily weather search error (non-fatal): {exc}")
        return ""


def _to_langchain_messages(history: list[dict[str, Any]]) -> list[BaseMessage]:
    mapping = {"user": HumanMessage, "assistant": AIMessage}
    result: list[BaseMessage] = []
    for entry in history:
        cls = mapping.get(entry.get("role", ""))
        if cls and entry.get("content"):
            result.append(cls(content=entry["content"]))
    return result


def run_agent(message: str, history: list[dict[str, Any]]) -> dict[str, Any]:
    """Run the Peru transport assistant and return a structured response."""
    try:
        llm = _get_llm()

        search_context = ""
        used_search = False

        if _needs_search(message):
            location = _extract_location(message)

            transport_snippets = _search_transport(message)
            # Always fetch weather alongside transport search
            weather_snippets = _search_weather(location)

            parts: list[str] = []
            if transport_snippets:
                parts.append(f"Información de transporte en Perú:\n{transport_snippets}")
            if weather_snippets:
                date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                parts.append(
                    f"Condiciones climáticas en {location} (hoy, {date_str}):\n{weather_snippets}"
                )

            if parts:
                search_context = "\n\n".join(parts)
                used_search = True

        system_content = SYSTEM_PROMPT
        if search_context:
            system_content += f"\n\nResultados de búsqueda web reciente:\n{search_context}"

        messages: list[BaseMessage] = [SystemMessage(content=system_content)]
        messages.extend(_to_langchain_messages(history))
        messages.append(HumanMessage(content=message))

        response = llm.invoke(messages)
        reply: str = response.content

        tokens_used = 0
        usage = getattr(response, "usage_metadata", None) or getattr(
            response, "response_metadata", {}
        )
        if isinstance(usage, dict):
            tokens_used = (
                usage.get("token_usage", {}).get("total_tokens", 0)
                if "token_usage" in usage
                else usage.get("total_tokens", 0)
            )

        return {"response": reply, "tokens_used": tokens_used, "used_search": used_search}

    except Exception as exc:
        print(f"[agent] run_agent error: {exc}")
        return {
            "response": (
                "Lo siento, ocurrió un error al procesar tu consulta. "
                "Por favor, inténtalo de nuevo en unos momentos."
            ),
            "tokens_used": 0,
            "used_search": False,
        }
