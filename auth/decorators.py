from functools import wraps

import jwt
from flask import g, request

from auth.security import decode_token
from utils import error


def login_required(f):
    """Authentication: is there a valid token? Puts the user in g.user."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return error("Missing or invalid Authorization header", 401)
        try:
            g.user = decode_token(header[7:])
        except jwt.ExpiredSignatureError:
            return error("Token expired, please log in again", 401)
        except jwt.InvalidTokenError:
            return error("Invalid token", 401)
        return f(*args, **kwargs)
    return wrapper


def role_required(*roles):
    """Authorization: is this role allowed?   @role_required("admin", "manager")"""
    def decorator(f):
        @login_required
        @wraps(f)
        def wrapper(*args, **kwargs):
            if g.user["role"] not in roles:
                return error("You do not have permission to do this", 403)
            return f(*args, **kwargs)
        return wrapper
    return decorator


def can_access_warehouse(user, warehouse_id):
    """Rule 16: admin sees all warehouses, manager/staff only their own."""
    return user["role"] == "admin" or user.get("warehouse_id") == warehouse_id
