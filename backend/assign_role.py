"""
Asigna un custom claim 'role' a un usuario de Firebase.

Uso:
    python assign_role.py <uid> <role>

Roles válidos:
    assistant_user  — puede usar el chat
    viewer          — puede ver historial de sesiones
    admin           — acceso total al dashboard
"""

import sys
import os

import firebase_admin
from firebase_admin import auth, credentials
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_ROLES = {"assistant_user", "viewer", "admin"}


# ---------------------------------------------------------------------------
# Firebase init
# ---------------------------------------------------------------------------

def init_firebase() -> None:
    if firebase_admin._apps:
        return
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "../service-account.json")
    if not os.path.exists(cred_path):
        print(f"[ERROR] No se encontró el archivo de credenciales: {cred_path}")
        sys.exit(1)
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)


# ---------------------------------------------------------------------------
# Role assignment
# ---------------------------------------------------------------------------

def assign_role(uid: str, role: str) -> None:
    # 1 — Validate role
    if role not in VALID_ROLES:
        valid = ", ".join(sorted(VALID_ROLES))
        print(f"[ERROR] Rol inválido: '{role}'")
        print(f"        Roles permitidos: {valid}")
        sys.exit(1)

    # 2 — Verify the user exists and fetch their record
    try:
        user_record = auth.get_user(uid)
    except auth.UserNotFoundError:
        print(f"[ERROR] No existe ningún usuario con uid: '{uid}'")
        print("        Verifica el uid en la consola de Firebase Authentication.")
        sys.exit(1)
    except Exception as exc:
        print(f"[ERROR] No se pudo obtener el usuario: {exc}")
        sys.exit(1)

    # 3 — Assign the custom claim
    try:
        auth.set_custom_user_claims(uid, {"role": role})
    except Exception as exc:
        print(f"[ERROR] No se pudo asignar el rol: {exc}")
        sys.exit(1)

    # 4 — Confirmation
    email = user_record.email or "(sin email)"
    print()
    print("  Rol asignado correctamente")
    print(f"  UID   : {uid}")
    print(f"  Email : {email}")
    print(f"  Rol   : {role}")
    print()
    print("  AVISO: El usuario debe cerrar e iniciar sesion para ver el cambio.")
    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

    if len(sys.argv) != 3:
        print(__doc__)
        print("Uso: python assign_role.py <uid> <role>")
        print(f"Roles válidos: {', '.join(sorted(VALID_ROLES))}")
        sys.exit(1)

    _, uid, role = sys.argv

    init_firebase()
    assign_role(uid, role)


if __name__ == "__main__":
    main()
