from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from google.cloud import firestore

SESSIONS_COLLECTION = "sessions"
CHATS_SUBCOLLECTION  = "chats"


@lru_cache(maxsize=1)
def _get_db() -> firestore.Client:
    return firestore.Client()


def _empty_profile(uid: str) -> dict[str, Any]:
    return {
        "cliente_id": uid,
        "nombre": "",
        "email": "",
        "preferencias": [],
        "notas": "",
        "fecha_ultimo_ingreso": None,
    }


# ---------------------------------------------------------------------------
# Profile API
# ---------------------------------------------------------------------------

def get_user_profile(uid: str) -> dict[str, Any]:
    try:
        doc = _get_db().collection(SESSIONS_COLLECTION).document(uid).get()
        if not doc.exists:
            return _empty_profile(uid)
        data = doc.to_dict()
        return {
            "cliente_id": data.get("cliente_id", uid),
            "nombre": data.get("nombre", ""),
            "email": data.get("email", ""),
            "preferencias": data.get("preferencias", []),
            "notas": data.get("notas", ""),
            "fecha_ultimo_ingreso": str(data["fecha_ultimo_ingreso"])
            if data.get("fecha_ultimo_ingreso")
            else None,
        }
    except Exception as exc:
        print(f"[firestore] get_user_profile error for uid={uid!r}: {exc}")
        return _empty_profile(uid)


def update_user_profile(uid: str, updates: dict[str, Any]) -> None:
    try:
        ref = _get_db().collection(SESSIONS_COLLECTION).document(uid)
        updates["updated_at"] = firestore.SERVER_TIMESTAMP
        ref.set(updates, merge=True)
    except Exception as exc:
        print(f"[firestore] update_user_profile error for uid={uid!r}: {exc}")


def touch_last_login(uid: str, email: str = "", nombre: str = "") -> None:
    try:
        ref = _get_db().collection(SESSIONS_COLLECTION).document(uid)
        doc = ref.get()
        now_iso = datetime.now(timezone.utc).isoformat()
        if not doc.exists:
            ref.set(
                {
                    "cliente_id": uid,
                    "uid": uid,
                    "nombre": nombre,
                    "email": email,
                    "preferencias": [],
                    "notas": "",
                    "messages": [],
                    "fecha_ultimo_ingreso": now_iso,
                    "created_at": firestore.SERVER_TIMESTAMP,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                }
            )
        else:
            update_data: dict[str, Any] = {
                "fecha_ultimo_ingreso": now_iso,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
            if email:
                update_data["email"] = email
            if nombre:
                update_data["nombre"] = nombre
            ref.set(update_data, merge=True)
    except Exception as exc:
        print(f"[firestore] touch_last_login error for uid={uid!r}: {exc}")


# ---------------------------------------------------------------------------
# History API
# ---------------------------------------------------------------------------

def get_session_history(uid: str) -> list[dict[str, Any]]:
    try:
        doc = _get_db().collection(SESSIONS_COLLECTION).document(uid).get()
        if not doc.exists:
            return []
        return doc.to_dict().get("messages", [])
    except Exception as exc:
        print(f"[firestore] get_session_history error for uid={uid!r}: {exc}")
        return []


def save_message(uid: str, role: str, content: str, tokens: int = 0, session_id: str | None = None) -> None:
    message = {
        "role": role,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tokens_used": tokens,
    }
    if session_id:
        message["session_id"] = session_id
    db = _get_db()
    ref = db.collection(SESSIONS_COLLECTION).document(uid)
    try:
        doc = ref.get()
        if not doc.exists:
            ref.set(
                {
                    "cliente_id": uid,
                    "uid": uid,
                    "nombre": "",
                    "email": "",
                    "preferencias": [],
                    "notas": "",
                    "messages": [message],
                    "created_at": firestore.SERVER_TIMESTAMP,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                }
            )
        else:
            ref.set(
                {
                    "updated_at": firestore.SERVER_TIMESTAMP,
                    "messages": firestore.ArrayUnion([message]),
                },
                merge=True,
            )
    except Exception as exc:
        print(f"[firestore] save_message error for uid={uid!r}: {exc}")


def clear_session(uid: str) -> None:
    """Clear the message history but preserve user profile data."""
    try:
        _get_db().collection(SESSIONS_COLLECTION).document(uid).set(
            {"messages": [], "updated_at": firestore.SERVER_TIMESTAMP},
            merge=True,
        )
    except Exception as exc:
        print(f"[firestore] clear_session error for uid={uid!r}: {exc}")


def get_all_sessions() -> list[dict[str, Any]]:
    try:
        docs = _get_db().collection(SESSIONS_COLLECTION).stream()
        sessions: list[dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict()
            sessions.append(
                {
                    "id": doc.id,
                    "cliente_id": data.get("cliente_id", doc.id),
                    "uid": data.get("uid", ""),
                    "nombre": data.get("nombre", ""),
                    "email": data.get("email", ""),
                    "updated_at": data.get("updated_at"),
                    "fecha_ultimo_ingreso": data.get("fecha_ultimo_ingreso"),
                    "message_count": len(data.get("messages", [])),
                }
            )
        return sessions
    except Exception as exc:
        print(f"[firestore] get_all_sessions error: {exc}")
        return []


# ---------------------------------------------------------------------------
# Chat API  (subcollection: sessions/{uid}/chats/{chat_id})
# chat_id format: YYYYMMDD_HHmmss_mmm  — date-based, newest sorts last lexicographically
# ---------------------------------------------------------------------------

def _chats_col(uid: str):
    return (
        _get_db()
        .collection(SESSIONS_COLLECTION)
        .document(uid)
        .collection(CHATS_SUBCOLLECTION)
    )


def save_chat_message(uid: str, chat_id: str, role: str, content: str, tokens: int = 0) -> None:
    message: dict[str, Any] = {
        "role": role,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tokens_used": tokens,
    }
    ref = _chats_col(uid).document(chat_id)
    try:
        doc = ref.get()
        if not doc.exists:
            ref.set(
                {
                    "chat_id": chat_id,
                    "uid": uid,
                    "messages": [message],
                    "preview": content[:80] if role == "user" else "",
                    "created_at_iso": datetime.now(timezone.utc).isoformat(),
                    "created_at": firestore.SERVER_TIMESTAMP,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                }
            )
        else:
            update: dict[str, Any] = {
                "messages": firestore.ArrayUnion([message]),
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
            data = doc.to_dict()
            if role == "user" and not data.get("preview"):
                update["preview"] = content[:80]
            ref.set(update, merge=True)
    except Exception as exc:
        print(f"[firestore] save_chat_message error uid={uid!r} chat_id={chat_id!r}: {exc}")


def get_chat_messages(uid: str, chat_id: str) -> list[dict[str, Any]]:
    try:
        doc = _chats_col(uid).document(chat_id).get()
        if not doc.exists:
            return []
        return doc.to_dict().get("messages", [])
    except Exception as exc:
        print(f"[firestore] get_chat_messages error uid={uid!r} chat_id={chat_id!r}: {exc}")
        return []


def list_chats(uid: str) -> list[dict[str, Any]]:
    try:
        docs = _chats_col(uid).stream()
        result: list[dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict()
            result.append(
                {
                    "chat_id": doc.id,
                    "preview": data.get("preview", ""),
                    "created_at": data.get("created_at_iso", doc.id),
                    "message_count": len(data.get("messages", [])),
                }
            )
        # Sort newest-first using the chat_id string (YYYYMMDD_HHmmss_mmm is lexicographically chronological)
        result.sort(key=lambda x: x["chat_id"], reverse=True)
        return result
    except Exception as exc:
        print(f"[firestore] list_chats error uid={uid!r}: {exc}")
        return []


def delete_chat(uid: str, chat_id: str) -> None:
    try:
        _chats_col(uid).document(chat_id).delete()
    except Exception as exc:
        print(f"[firestore] delete_chat error uid={uid!r} chat_id={chat_id!r}: {exc}")


def delete_all_chats(uid: str) -> None:
    try:
        for doc in _chats_col(uid).stream():
            doc.reference.delete()
    except Exception as exc:
        print(f"[firestore] delete_all_chats error uid={uid!r}: {exc}")
