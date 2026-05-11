from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from google.cloud import firestore

SESSIONS_COLLECTION = "sessions"


# ---------------------------------------------------------------------------
# Client (singleton)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _get_db() -> firestore.Client:
    """Return a cached synchronous Firestore client."""
    return firestore.Client()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_session_history(uid: str) -> list[dict[str, Any]]:
    """Return the message history for a user session.

    Args:
        uid: Firebase user ID used as the Firestore document ID.

    Returns:
        List of message dicts stored in the ``messages`` array field,
        or an empty list if the document does not exist.
    """
    try:
        doc = _get_db().collection(SESSIONS_COLLECTION).document(uid).get()
        if not doc.exists:
            return []
        return doc.to_dict().get("messages", [])
    except Exception as exc:
        print(f"[firestore] get_session_history error for uid={uid!r}: {exc}")
        return []


def save_message(
    uid: str,
    role: str,
    content: str,
    tokens: int = 0,
) -> None:
    """Append a message to the user's session document.

    Creates the session document if it does not yet exist.

    Args:
        uid: Firebase user ID / Firestore document ID.
        role: Message author – typically ``"user"`` or ``"assistant"``.
        content: Text body of the message.
        tokens: Number of tokens consumed by this message (default 0).
    """
    message = {
        "role": role,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),  # SERVER_TIMESTAMP invalid inside ArrayUnion
        "tokens_used": tokens,
    }

    db = _get_db()
    ref = db.collection(SESSIONS_COLLECTION).document(uid)

    try:
        ref.set(
            {
                "uid": uid,
                "updated_at": firestore.SERVER_TIMESTAMP,
                "messages": firestore.ArrayUnion([message]),
            },
            merge=True,  # creates the document if absent, otherwise merges
        )

        # Ensure base fields exist on first write without overwriting later updates.
        ref.set(
            {
                "uid": uid,
                "email": "",
                "created_at": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception as exc:
        print(f"[firestore] save_message error for uid={uid!r}: {exc}")


def clear_session(uid: str) -> None:
    """Delete the session document for a user.

    Args:
        uid: Firebase user ID / Firestore document ID.
    """
    try:
        _get_db().collection(SESSIONS_COLLECTION).document(uid).delete()
    except Exception as exc:
        print(f"[firestore] clear_session error for uid={uid!r}: {exc}")


def get_all_sessions() -> list[dict[str, Any]]:
    """Return a summary of every session in the collection.

    Intended for ``admin`` and ``viewer`` roles.

    Returns:
        List of dicts, each containing:
        ``id``, ``uid``, ``email``, ``updated_at``, ``message_count``.
    """
    try:
        docs = _get_db().collection(SESSIONS_COLLECTION).stream()
        sessions: list[dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict()
            sessions.append(
                {
                    "id": doc.id,
                    "uid": data.get("uid", ""),
                    "email": data.get("email", ""),
                    "updated_at": data.get("updated_at"),
                    "message_count": len(data.get("messages", [])),
                }
            )
        return sessions
    except Exception as exc:
        print(f"[firestore] get_all_sessions error: {exc}")
        return []
