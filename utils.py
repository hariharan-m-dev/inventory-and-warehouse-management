from flask import g, jsonify, request


def error(message, status=400):
    """Every error in the API has the same shape: {"error": "..."}"""
    return jsonify({"error": message}), status


def missing_fields(data, fields):
    return [f for f in fields if data.get(f) in (None, "")]


def to_int(value, minimum=0):
    s = str(value).strip()
    if not s.lstrip("-").isdigit():
        return None
    n = int(s)
    return n if n >= minimum else None


def to_price(value):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if 0 <= n < 1e8 else None


def show_inactive():
    """Only admins can ask for deactivated records: ?include_inactive=true"""
    return request.args.get("include_inactive") == "true" and g.user["role"] == "admin"
