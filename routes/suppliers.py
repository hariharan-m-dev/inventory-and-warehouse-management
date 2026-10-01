from flask import Blueprint

from routes.crud import register_crud

bp = Blueprint("suppliers", __name__, url_prefix="/suppliers")

SELECT = "SELECT s.id, s.name, s.contact, s.is_active FROM suppliers s"


def clean(data, partial):
    out = {}
    if "name" in data:
        name = str(data["name"]).strip()
        if not name:
            return None, "Name cannot be empty"
        out["name"] = name
    if "contact" in data:
        out["contact"] = str(data["contact"] or "").strip() or None
    if partial and "is_active" in data:
        out["is_active"] = bool(data["is_active"])
    return out, None


register_crud(bp, table="suppliers", alias="s", select_sql=SELECT, clean=clean,
              required=["name"], read_roles=("admin", "manager"),
              unique_msg="A supplier with this name already exists")
