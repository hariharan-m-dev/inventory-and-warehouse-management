from flask import Blueprint, jsonify

from auth.decorators import role_required
from db import transaction
from utils import error

bp = Blueprint("categories", __name__, url_prefix="/categories")


@bp.get("")
@role_required("admin", "manager", "staff")
def list_categories():
    with transaction() as cur:
        cur.execute("SELECT id, name FROM categories ORDER BY name")
        return jsonify(cur.fetchall())


@bp.get("/<int:cid>")
@role_required("admin", "manager", "staff")
def get_category(cid):
    with transaction() as cur:
        cur.execute("SELECT id, name FROM categories WHERE id = %s", (cid,))
        row = cur.fetchone()
    return jsonify(row) if row else error("Not found", 404)
