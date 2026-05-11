from __future__ import annotations

import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_mistralai import ChatMistralAI
from tavily import TavilyClient

SYSTEM_PROMPT = """Eres un asistente especializado en infraestructura cloud.

Tu perfil:
- Experto en AWS, GCP, Azure, Kubernetes, Terraform, CI/CD y arquitecturas distribuidas.
- Responde siempre en español de forma técnica pero clara y concisa.
- Adapta el nivel de detalle al conocimiento del usuario.

Cuando se te proporcione contexto de búsqueda web:
- Úsalo para enriquecer tu respuesta.
- Cita las fuentes con el formato: [Fuente: <url>].

Formato de respuesta:
- Usa markdown cuando sea útil (bloques de código, listas, tablas).
- Sé directo: no repitas la pregunta ni añadas relleno."""

# Keywords that suggest a web search would be helpful
_SEARCH_KEYWORDS = (
    "último", "última", "últimos", "reciente", "ahora", "hoy", "actual",
    "precio", "costo", "versión", "release", "anuncio", "noticia",
    "incidente", "outage", "caída", "novedad", "2024", "2025", "2026",
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


def _to_langchain_messages(history: list[dict[str, Any]]) -> list[BaseMessage]:
    mapping = {"user": HumanMessage, "assistant": AIMessage}
    result: list[BaseMessage] = []
    for entry in history:
        cls = mapping.get(entry.get("role", ""))
        if cls and entry.get("content"):
            result.append(cls(content=entry["content"]))
    return result


def run_agent(message: str, history: list[dict[str, Any]]) -> dict[str, Any]:
    """Run the cloud-infrastructure assistant and return a structured response.

    Args:
        message: The user's current message.
        history: Prior conversation as ``[{"role": ..., "content": ...}]`` dicts.

    Returns:
        Dict with ``response`` (str), ``tokens_used`` (int), ``used_search`` (bool).
    """
    try:
        llm = _get_llm()

        # 1 — Optionally search the web
        search_context = ""
        used_search = False

        if _needs_search(message):
            try:
                results = _get_tavily().search(message, max_results=3)
                snippets = [
                    f"- {r['content']} [Fuente: {r['url']}]"
                    for r in results.get("results", [])
                    if r.get("content")
                ]
                if snippets:
                    search_context = "\n".join(snippets)
                    used_search = True
            except Exception as search_err:
                print(f"[agent] Tavily search error (non-fatal): {search_err}")

        # 2 — Build message list for the LLM
        system_content = SYSTEM_PROMPT
        if search_context:
            system_content += f"\n\nResultados de búsqueda web reciente:\n{search_context}"

        messages: list[BaseMessage] = [SystemMessage(content=system_content)]
        messages.extend(_to_langchain_messages(history))
        messages.append(HumanMessage(content=message))

        # 3 — Call Mistral directly (no tool-calling agent, no ID issues)
        response = llm.invoke(messages)
        reply: str = response.content

        # 4 — Extract token usage if available
        tokens_used = 0
        usage = getattr(response, "usage_metadata", None) or getattr(response, "response_metadata", {})
        if isinstance(usage, dict):
            tokens_used = usage.get("token_usage", {}).get("total_tokens", 0) if "token_usage" in usage \
                          else usage.get("total_tokens", 0)

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
