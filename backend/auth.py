from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated, Any

import firebase_admin
from fastapi import Depends, Header, HTTPException, status
from firebase_admin import auth, credentials
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Firebase initialisation (lazy, singleton)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _init_firebase() -> firebase_admin.App:
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS environment variable is not set")
    cred = credentials.Certificate(cred_path)
    return firebase_admin.initialize_app(cred)


# ---------------------------------------------------------------------------
# User model
# ---------------------------------------------------------------------------

class UserPayload(BaseModel):
    uid: str
    email: str | None
    role: str | None


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

def verify_firebase_token(token: str) -> dict[str, Any]:
    _init_firebase()
    try:
        # check_revoked=False: avoids an extra HTTP round-trip to Firebase on
        # every request. Revocation is rare; the 1-hour token TTL is sufficient.
        decoded = auth.verify_id_token(token, check_revoked=False)
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Token expirado. Recarga la página.")
    except auth.RevokedIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Sesión revocada. Inicia sesión nuevamente.")
    except auth.InvalidIdTokenError as exc:
        print(f"[auth] InvalidIdTokenError: {exc}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Token inválido. Recarga la página.")
    except Exception as exc:
        # Log the real error so we can diagnose it in the server console
        print(f"[auth] verify_id_token unexpected error ({type(exc).__name__}): {exc}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Error al verificar la sesión. Intenta de nuevo.")

    return {
        "uid":   decoded["uid"],
        "email": decoded.get("email"),
        "role":  decoded.get("role"),
    }


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def get_current_user(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header Authorization ausente o mal formado. Use: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.removeprefix("Bearer ").strip()
    return verify_firebase_token(token)


def require_role(allowed_roles: list[str]):
    def _check(user: Annotated[dict, Depends(get_current_user)]) -> dict[str, Any]:
        if user.get("role") not in allowed_roles:
            allowed = ", ".join(allowed_roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Acceso denegado. Se requiere uno de los siguientes roles: {allowed}. "
                    f"Tu rol actual: {user.get('role')!r}."
                ),
            )
        return user
    return _check


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Admin: Firebase Auth user management
# ---------------------------------------------------------------------------

def list_firebase_users() -> list[dict[str, Any]]:
    """Return all Firebase Auth users with their custom-claim roles."""
    _init_firebase()
    users: list[dict[str, Any]] = []
    page = auth.list_users()
    while page:
        for u in page.users:
            claims = u.custom_claims or {}
            meta   = u.user_metadata
            users.append({
                "uid":          u.uid,
                "email":        u.email or "",
                "display_name": u.display_name or "",
                "role":         claims.get("role"),
                "disabled":     u.disabled,
                "created_at":   meta.creation_timestamp,
                "last_sign_in": meta.last_sign_in_timestamp,
            })
        page = page.get_next_page()
    return users


def set_user_role(uid: str, role: str | None) -> None:
    """Assign (or clear) the custom role claim for a Firebase user."""
    _init_firebase()
    auth.set_custom_user_claims(uid, {"role": role} if role else {})


def delete_firebase_user(uid: str) -> None:
    """Permanently delete a Firebase Auth account."""
    _init_firebase()
    auth.delete_user(uid)
