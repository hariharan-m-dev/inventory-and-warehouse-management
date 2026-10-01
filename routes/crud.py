"""Generic CRUD for master-data tables. Soft delete only (rule 13)."""
import psycopg2
from flask import jsonify, request
from psycopg2 import errors

from auth.decorators import role_required
from db import transaction
from utils import error, missing_fields, show_inactive


def register_crud(bp, *, table, alias, select_sql, clean, required, read_roles,
                  unique_msg, check_msg="Invalid value", guard_deactivate=None,
                  write_roles=("admin",)):

    def fetch_one(cur, rid):
        cur.execute(f"{select_sql} WHERE {alias}.id = %s", (rid,))
        return cur.fetchone()

    @bp.get("")
    @role_required(*read_roles)
    def list_all():
        where = "" if show_inactive() else f"WHERE {alias}.is_active = TRUE"
        with transaction() as cur:
            cur.execute(f"{select_sql} {where} ORDER BY {alias}.id")
            rows = cur.fetchall()
        return jsonify(rows)

    @bp.get("/<int:rid>")
    @role_required(*read_roles)
    def get_one(rid):
        with transaction() as cur:
            row = fetch_one(cur, rid)
        return jsonify(row) if row else error("Not found", 404)

    @bp.post("")
    @role_required(*write_roles)
    def create():
        data = request.get_json(silent=True) or {}
        missing = missing_fields(data, required)
        if missing:
            return error(f"Missing required fields: {', '.join(missing)}", 400)
        values, err = clean(data, False)
        if err:
            return error(err, 400)
        cols = list(values)
        try:
            with transaction() as cur:
                cur.execute(
                    f"INSERT INTO {table} ({', '.join(cols)}) "
                    f"VALUES ({', '.join(['%s'] * len(cols))}) RETURNING id",
                    [values[c] for c in cols])
                row = fetch_one(cur, cur.fetchone()["id"])
        except errors.UniqueViolation:
            return error(unique_msg, 409)
        except errors.ForeignKeyViolation:
            return error("Referenced record does not exist", 400)
        except errors.CheckViolation:
            return error(check_msg, 400)
        except psycopg2.DataError:
            return error("Invalid value in request", 400)
        return jsonify(row), 201

    @bp.put("/<int:rid>")
    @role_required(*write_roles)
    def update(rid):
        data = request.get_json(silent=True) or {}
        values, err = clean(data, True)
        if err:
            return error(err, 400)
        if not values:
            return error("Nothing to update", 400)
        if values.get("is_active") is False and guard_deactivate:
            msg = guard_deactivate(rid)
            if msg:
                return error(msg, 400)
        sets = ", ".join(f"{c} = %s" for c in values)
        try:
            with transaction() as cur:
                cur.execute(f"UPDATE {table} SET {sets} WHERE id = %s RETURNING id",
                            [*values.values(), rid])
                if not cur.fetchone():
                    return error("Not found", 404)
                row = fetch_one(cur, rid)
        except errors.UniqueViolation:
            return error(unique_msg, 409)
        except errors.ForeignKeyViolation:
            return error("Referenced record does not exist", 400)
        except errors.CheckViolation:
            return error(check_msg, 400)
        except psycopg2.DataError:
            return error("Invalid value in request", 400)
        return jsonify(row)

    @bp.delete("/<int:rid>")
    @role_required(*write_roles)
    def deactivate(rid):
        if guard_deactivate:
            msg = guard_deactivate(rid)
            if msg:
                return error(msg, 400)
        with transaction() as cur:
            cur.execute(f"UPDATE {table} SET is_active = FALSE WHERE id = %s RETURNING id", (rid,))
            if not cur.fetchone():
                return error("Not found", 404)
        return jsonify({"message": "Deactivated"})
