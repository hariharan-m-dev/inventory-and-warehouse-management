from flask import Blueprint, g, jsonify, request

from auth.decorators import login_required
from auth.security import create_token, verify_password
from db import transaction
from utils import error

bp = Blueprint("auth", __name__, url_prefix="/auth")

USER_SQL = """
SELECT u.id, u.name, u.email, u.password_hash, u.role,
       u.warehouse_id, w.name AS warehouse_name,
       u.supplier_id,  s.name AS supplier_name, u.is_active
FROM users u
LEFT JOIN warehouses w ON w.id = u.warehouse_id
LEFT JOIN suppliers  s ON s.id = u.supplier_id
"""


def public(user):
    return {k: v for k, v in user.items() if k != "password_hash"}


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    if not email or not password:
        return error("Email and password are required", 400)

    with transaction() as cur:
        cur.execute(USER_SQL + " WHERE LOWER(u.email) = %s", (email,))
        user = cur.fetchone()

    if not user or not user["is_active"] or not verify_password(password, user["password_hash"]):
        return error("Invalid email or password", 401)
    return jsonify({"token": create_token(user), "user": public(user)})


@bp.get("/me")
@login_required
def me():
    with transaction() as cur:
        cur.execute(USER_SQL + " WHERE u.id = %s", (g.user["user_id"],))
        user = cur.fetchone()
    if not user or not user["is_active"]:
        return error("User no longer active", 401)
    return jsonify(public(user))
