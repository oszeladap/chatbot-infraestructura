from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_mistralai import ChatMistralAI
from tavily import TavilyClient

_SYSTEM_PROMPT_TEMPLATE = """\
Eres el asistente del Sistema Inteligente de Viajes de Peru.
Fecha de hoy: {today}

PERFIL:
Experto en transporte aereo y terrestre, hospedaje, gastronomia, turismo y clima en Peru.
- Aerolineas: LATAM Peru, Sky Airline, Avianca, JetSmart, Star Peru
- Buses: Cruz del Sur, Oltursa, Tepsa, Civa, Movil Tours, Ittsa, Flores Hermanos
- Trenes: PeruRail, Inca Rail (Cusco-Machu Picchu)

REGLAS DE FORMATO — OBLIGATORIO:
1. Usa emojis al inicio de cada seccion: ✈️ vuelos, 🚌 buses, 🏨 hospedaje, 🍽️ alimentacion, 🚕 transporte local, 🗺️ lugares/turismo, ☁️ clima.
2. Usa ## para encabezados de seccion y **negrita** para precios y datos clave.
3. Usa tablas markdown para comparativas con 2+ opciones.
4. OBLIGATORIO: cuando se mencione una ciudad destino, incluye SIEMPRE al final la seccion "☁️ ## Clima en [ciudad]" con temperatura, precipitaciones y recomendaciones de ropa para la fecha {today} o la fecha indicada.
5. Usa la fecha {today} como referencia para temporada, disponibilidad y precios vigentes.
6. Si la consulta especifica una fecha futura, usa esa fecha para clima y precios de temporada.
7. Cita fuentes web: [Fuente: url]
8. Responde directamente sin repetir la pregunta del usuario.\
"""

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
    # Travel & tourism (expanded)
    "viaje", "destino", "itinerario", "escala", "conexion",
    "turismo", "turista", "visitar", "excursion", "tour",
    # Accommodation & food
    "hotel", "hostal", "hospedaje", "alojamiento",
    "restaurante", "comida", "gastronomia",
    # Weather
    "clima", "tiempo", "lluvia", "temperatura", "sol", "niebla", "neblina",
    "calor", "frio",
    # Cities
    *_PERU_CITIES,
)

_MONTHS_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


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
    low = message.lower()
    for city in sorted(_PERU_CITIES, key=len, reverse=True):
        if city in low:
            return city.title()
    return "Lima"


def _extract_date_context(message: str) -> str:
    """Return a date reference from the message, or today's date."""
    low = message.lower()
    year_now = datetime.now(timezone.utc).year

    for month_name in _MONTHS_ES:
        if month_name in low:
            year_match = re.search(r"\b(20[2-3]\d)\b", message)
            year = int(year_match.group()) if year_match else year_now
            return f"{month_name} {year}"

    date_match = re.search(r"\b(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{{4}}))?\b", message)
    if date_match:
        day, month_num = date_match.group(1), date_match.group(2)
        year = date_match.group(3) or str(year_now)
        return f"{day}/{month_num}/{year}"

    return datetime.now(timezone.utc).strftime("%d de %B de %Y")


def _search_transport(message: str, date_context: str) -> str:
    query = f"{message} precios transporte Peru aereo terrestre hospedaje {date_context}"
    try:
        results = _get_tavily().search(query, max_results=4)
        snippets = [
            f"- {r['content']} [Fuente: {r['url']}]"
            for r in results.get("results", [])
            if r.get("content")
        ]
        return "\n".join(snippets)
    except Exception as exc:
        print(f"[agent] Tavily transport search error (non-fatal): {exc}")
        return ""


def _search_weather(location: str, date_context: str) -> str:
    query = f"clima tiempo meteorologico {location} Peru {date_context} temperatura lluvia maxima minima"
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
    """Run the Peru travel assistant and return a structured response."""
    try:
        llm = _get_llm()

        today = datetime.now(timezone.utc).strftime("%d de %B de %Y")
        date_context = _extract_date_context(message)
        location = _extract_location(message)

        search_context = ""
        used_search = False

        if _needs_search(message):
            transport_snippets = _search_transport(message, date_context)
            weather_snippets = _search_weather(location, date_context)

            parts: list[str] = []
            if transport_snippets:
                parts.append(
                    f"Informacion actualizada de transporte, hospedaje y turismo en Peru ({date_context}):\n{transport_snippets}"
                )
            if weather_snippets:
                parts.append(
                    f"[INCLUIR OBLIGATORIAMENTE] Condiciones climaticas en {location} para {date_context}:\n{weather_snippets}"
                )

            if parts:
                search_context = "\n\n".join(parts)
                used_search = True

        system_content = _SYSTEM_PROMPT_TEMPLATE.format(today=today)
        if search_context:
            system_content += f"\n\nResultados de busqueda web reciente:\n{search_context}"

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


# ---------------------------------------------------------------------------
# Structured summary for executive PDF
# ---------------------------------------------------------------------------

def _empty_summary() -> dict:
    nd = "No disponible"
    return {
        "destino":  nd,
        "clima":    {"descripcion": nd, "temperatura": nd, "recomendacion": nd},
        "costos":   {
            "transporte":   {"economico": nd, "comodo": nd},
            "hospedaje":    {"economico": nd, "comodo": nd},
            "alimentacion": {"economico": nd, "comodo": nd},
            "tours":        {"economico": nd, "comodo": nd},
        },
        "lugares":  [],
        "consejos": [],
    }


def generate_summary(messages: list[dict]) -> dict:
    """Send conversation to Mistral and extract structured data for the executive PDF."""
    try:
        lines: list[str] = []
        for m in messages:
            role    = "Usuario" if m.get("role") == "user" else "Asistente"
            content = (m.get("content") or "").strip()
            if content:
                lines.append(f"{role}: {content[:1500]}")

        if not lines:
            return _empty_summary()

        conv_text = "\n\n".join(lines)

        prompt = f"""Analiza esta conversacion de viajes en Peru y extrae la informacion clave.

CONVERSACION:
{conv_text}

Responde UNICAMENTE con un JSON valido. Estructura exacta:
{{
  "destino": "ciudad o destino principal (solo el nombre, ej: Cusco)",
  "clima": {{
    "descripcion": "descripcion breve del clima en 1 oracion",
    "temperatura": "rango de temperatura con unidades (ej: 8-22 C)",
    "recomendacion": "que ropa llevar o mejor epoca para visitar"
  }},
  "costos": {{
    "transporte":   {{"economico": "precio y operador mas economico", "comodo": "precio y operador premium"}},
    "hospedaje":    {{"economico": "precio hostal o basico por noche", "comodo": "precio hotel comodo por noche"}},
    "alimentacion": {{"economico": "precio menu basico del dia", "comodo": "precio restaurante comodo"}},
    "tours":        {{"economico": "tour o entrada mas economica", "comodo": "tour completo o con guia"}}
  }},
  "lugares":  ["Lugar 1", "Lugar 2", "Lugar 3", "Lugar 4", "Lugar 5"],
  "consejos": ["Consejo practico 1", "Consejo practico 2", "Consejo practico 3"]
}}

Reglas:
- Prioriza la informacion de la conversacion; si el destino es claro pero no se mencionaron datos de alguna categoria, usa tu conocimiento general sobre ese destino en Peru para proporcionar rangos tipicos en soles peruanos (S/.)
- NUNCA dejes un campo en "No disponible" si conoces el destino — proporciona estimados generales tipicos
- Solo usa "No disponible" si el destino no esta claro o realmente no tienes informacion de ninguna fuente
- Lugares: maximo 7, los mas relevantes e imperdibles del destino
- Consejos: maximo 5, los mas practicos y accionables para el turista
- Costos: incluye rangos concretos en soles (S/.) con operadores especificos si los conoces
- Clima: proporciona datos reales del destino para la epoca del ano actual
- NO incluyas markdown ni texto fuera del JSON"""

        llm_sum = ChatMistralAI(
            model="mistral-large-latest",
            temperature=0.1,
            api_key=os.environ["MISTRAL_API_KEY"],
        )
        response = llm_sum.invoke([HumanMessage(content=prompt)])
        raw = response.content.strip()

        # Strip markdown code fences if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```\s*$", "", raw, flags=re.MULTILINE)
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            raw = match.group()

        result = json.loads(raw)

        # Ensure required keys exist (fill missing with empty_summary defaults)
        base = _empty_summary()
        for key in base:
            if key not in result:
                result[key] = base[key]

        return result

    except Exception as exc:
        print(f"[agent] generate_summary error: {exc}")
        return _empty_summary()
