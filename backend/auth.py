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
    """Initialise the Firebase Admin SDK once using GOOGLE_APPLICATION_CREDENTIALS."""
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS environment variable is not set")
    cred = credentials.Certificate(cred_path)
    return firebase_admin.initialize_app(cred)


# ---------------------------------------------------------------------------
# User model
# ---------------------------------------------------------------------------

class UserPayload(BaseModel):
    """Decoded Firebase token payload exposed to route handlers."""

    uid: str
    email: str | None
    role: str | None


# ---------------------------------------------------------------------------
# Core verification
# ---------------------------------------------------------------------------

def verify_firebase_token(token: str) -> dict[str, Any]:
    """Verify a Firebase ID token and return a normalised user dict.

    Args:
        token: Raw JWT string extracted from the Authorization header.

    Returns:
        Dict with keys ``uid``, ``email``, and ``role`` (custom claim).

    Raises:
        HTTPException 401: If the token is invalid, expired, or revoked.
    """
    _init_firebase()
    try:
        decoded = auth.verify_id_token(token, check_revoked=True)
    except auth.RevokedIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token revocado. Inicia sesión nuevamente.",
        )
    except auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado. Inicia sesión nuevamente.",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
        )

    return {
        "uid": decoded["uid"],
        "email": decoded.get("email"),
        "role": decoded.get("role"),  # custom claim, may be absent
    }


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def get_current_user(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> dict[str, Any]:
    """FastAPI dependency that extracts and verifies the Bearer token.

    Args:
        authorization: Value of the ``Authorization`` HTTP header.

    Returns:
        Verified user dict with ``uid``, ``email``, and ``role``.

    Raises:
        HTTPException 401: If the header is missing or the token is invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header Authorization ausente o mal formado. Use: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.removeprefix("Bearer ").strip()
    return verify_firebase_token(token)


def require_role(allowed_roles: list[str]):
    """FastAPI dependency factory that enforces role-based access control.

    Usage::

        @app.get("/admin", dependencies=[Depends(require_role(["admin"]))])
        def admin_route(): ...

    Args:
        allowed_roles: List of role strings that are permitted to access the route.

    Returns:
        A FastAPI dependency function that validates the current user's role.

    Raises:
        HTTPException 403: If the user's role is not in ``allowed_roles``.
    """
    def _check(user: Annotated[dict, Depends(get_current_user)]) -> dict[str, Any]:
        """Validate that the authenticated user holds one of the allowed roles.

        Args:
            user: User dict injected by ``get_current_user``.

        Returns:
            The same user dict if the role check passes.

        Raises:
            HTTPException 403: If the user's role is not authorised.
        """
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


# Convenience alias for routes that only need an authenticated user (any role)
CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
