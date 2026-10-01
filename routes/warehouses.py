from flask import Blueprint

from routes.crud import register_crud

bp = Blueprint("warehouses", __name__, url_prefix="/warehouses")

SELECT = "SELECT w.id, w.name, w.location, w.is_active FROM warehouses w"


def clean(data, partial):
    out = {}
    if "name" in data:
        name = str(data["name"]).strip()
        if not name:
            return None, "Name cannot be empty"
        out["name"] = name
    if "location" in data:
        out["location"] = str(data["location"] or "").strip() or None
    if partial and "is_active" in data:
        out["is_active"] = bool(data["is_active"])
    return out, None


register_crud(bp, table="warehouses", alias="w", select_sql=SELECT, clean=clean,
              required=["name"], read_roles=("admin", "manager", "staff"),
              unique_msg="A warehouse with this name already exists")
