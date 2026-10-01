from flask import Blueprint, g

from auth.security import hash_password
from routes.crud import register_crud

bp = Blueprint("users", __name__, url_prefix="/users")

ROLES = ("admin", "manager", "staff", "supplier")

SELECT = """
SELECT u.id, u.name, u.email, u.role,
       u.warehouse_id, w.name AS warehouse_name,
       u.supplier_id,  s.name AS supplier_name, u.is_active
FROM users u
LEFT JOIN warehouses w ON w.id = u.warehouse_id
LEFT JOIN suppliers  s ON s.id = u.supplier_id
"""


def clean(data, partial):
    out = {}
    if "name" in data:
        name = str(data["name"]).strip()
        if not name:
            return None, "Name cannot be empty"
        out["name"] = name
    if "email" in data:
        email = str(data["email"]).strip().lower()
        if "@" not in email:
            return None, "Enter a valid email"
        out["email"] = email
    if "password" in data:
        pw = str(data["password"])
        pw_bytes = pw.encode()
        if len(pw_bytes) < 6 or len(pw_bytes) > 72:
            return None, "Password must be 6 to 72 characters"
        out["password_hash"] = hash_password(pw)      # never stored or returned in plain text
    if "role" in data:
        if data["role"] not in ROLES:
            return None, f"Role must be one of: {', '.join(ROLES)}"
        out["role"] = data["role"]
    if "warehouse_id" in data:
        out["warehouse_id"] = data["warehouse_id"] or None
    if "supplier_id" in data:
        out["supplier_id"] = data["supplier_id"] or None
    if partial and "is_active" in data:
        out["is_active"] = bool(data["is_active"])
    if not partial:
        if out["role"] in ("manager", "staff") and not out.get("warehouse_id"):
            return None, "Manager and staff must be assigned a warehouse"
        if out["role"] == "supplier" and not out.get("supplier_id"):
            return None, "Supplier users must be linked to a supplier"
    return out, None


def guard(rid):
    if rid == g.user["user_id"]:
        return "You cannot deactivate your own account"


register_crud(bp, table="users", alias="u", select_sql=SELECT, clean=clean,
              required=["name", "email", "password", "role"], read_roles=("admin",),
              unique_msg="A user with this email already exists",
              check_msg="Manager/staff need a warehouse, supplier users need a supplier",
              guard_deactivate=guard)
