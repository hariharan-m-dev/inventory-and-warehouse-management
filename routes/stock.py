"""
Stock endpoints.

GET  /stock                      – inventory levels (filtered by warehouse for manager/staff)
GET  /stock/<warehouse_id>       – all products in one warehouse
GET  /stock/<warehouse_id>/<product_id> – single inventory cell
POST /stock/in                   – add stock (admin, manager, staff of that warehouse)
POST /stock/out                  – remove stock (admin, manager, staff of that warehouse)
POST /stock/transfer             – move stock between warehouses (admin only, or manager of src)
GET  /stock/movements            – movement history
GET  /stock/movements/<warehouse_id> – history for one warehouse
"""
from flask import Blueprint, g, jsonify, request

from auth.decorators import can_access_warehouse, login_required, role_required
from db import transaction
from services.stock import stock_in, stock_out, transfer
from utils import error, to_int

bp = Blueprint("stock", __name__, url_prefix="/stock")

MOVEMENT_SELECT = """
SELECT sm.id, sm.product_id, p.name AS product_name, p.sku,
       sm.warehouse_id, w.name AS warehouse_name,
       sm.type, sm.quantity, sm.user_id, u.name AS user_name,
       sm.po_id, sm.note, sm.created_at
FROM stock_movements sm
JOIN products   p ON p.id = sm.product_id
JOIN warehouses w ON w.id = sm.warehouse_id
JOIN users      u ON u.id = sm.user_id
"""


# ---------------------------------------------------------------------------
# Inventory views
# ---------------------------------------------------------------------------

@bp.get("")
@login_required
def list_stock():
    """
    Returns all inventory rows.
    manager/staff automatically see only their own warehouse.
    admin sees everything (optionally filter with ?warehouse_id=).
    supplier role cannot access stock.
    """
    user = g.user
    if user["role"] == "supplier":
        return error("You do not have permission to do this", 403)

    params = []
    clauses = []

    if user["role"] in ("manager", "staff"):
        clauses.append("i.warehouse_id = %s")
        params.append(user["warehouse_id"])
    elif request.args.get("warehouse_id"):
        wid = to_int(request.args.get("warehouse_id"), minimum=1)
        if wid is None:
            return error("Invalid warehouse_id", 400)
        clauses.append("i.warehouse_id = %s")
        params.append(wid)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    with transaction() as cur:
        cur.execute(
            f"""
            SELECT i.product_id, p.name AS product_name, p.sku, p.min_stock,
                   i.warehouse_id, w.name AS warehouse_name, i.quantity,
                   CASE WHEN i.quantity < p.min_stock THEN TRUE ELSE FALSE END AS low_stock
            FROM inventory i
            JOIN products   p ON p.id = i.product_id
            JOIN warehouses w ON w.id = i.warehouse_id
            {where}
            ORDER BY w.name, p.name
            """,
            params,
        )
        rows = cur.fetchall()
    return jsonify(rows)


@bp.get("/<int:warehouse_id>")
@login_required
def warehouse_stock(warehouse_id):
    """All inventory for one warehouse. manager/staff must own that warehouse."""
    user = g.user
    if user["role"] == "supplier":
        return error("You do not have permission to do this", 403)
    if not can_access_warehouse(user, warehouse_id):
        return error("You do not have access to this warehouse", 403)

    with transaction() as cur:
        cur.execute(
            """
            SELECT i.product_id, p.name AS product_name, p.sku, p.min_stock,
                   i.warehouse_id, w.name AS warehouse_name, i.quantity,
                   CASE WHEN i.quantity < p.min_stock THEN TRUE ELSE FALSE END AS low_stock
            FROM inventory i
            JOIN products   p ON p.id = i.product_id
            JOIN warehouses w ON w.id = i.warehouse_id
            WHERE i.warehouse_id = %s
            ORDER BY p.name
            """,
            (warehouse_id,),
        )
        rows = cur.fetchall()
    return jsonify(rows)


@bp.get("/<int:warehouse_id>/<int:product_id>")
@login_required
def single_stock(warehouse_id, product_id):
    """Inventory for one product in one warehouse."""
    user = g.user
    if user["role"] == "supplier":
        return error("You do not have permission to do this", 403)
    if not can_access_warehouse(user, warehouse_id):
        return error("You do not have access to this warehouse", 403)

    with transaction() as cur:
        cur.execute(
            """
            SELECT i.product_id, p.name AS product_name, p.sku, p.min_stock,
                   i.warehouse_id, w.name AS warehouse_name, i.quantity,
                   CASE WHEN i.quantity < p.min_stock THEN TRUE ELSE FALSE END AS low_stock
            FROM inventory i
            JOIN products   p ON p.id = i.product_id
            JOIN warehouses w ON w.id = i.warehouse_id
            WHERE i.warehouse_id = %s AND i.product_id = %s
            """,
            (warehouse_id, product_id),
        )
        row = cur.fetchone()
    return jsonify(row) if row else error("Not found", 404)


# ---------------------------------------------------------------------------
# Stock IN
# ---------------------------------------------------------------------------

@bp.post("/in")
@role_required("admin", "manager", "staff")
def do_stock_in():
    """
    Add stock to a warehouse.
    manager/staff can only add to their own warehouse.
    Body: {product_id, warehouse_id, quantity, note?}
    """
    data = request.get_json(silent=True) or {}
    product_id  = to_int(data.get("product_id"), minimum=1)
    warehouse_id = to_int(data.get("warehouse_id"), minimum=1)
    quantity    = to_int(data.get("quantity"), minimum=1)

    if not product_id:
        return error("product_id must be a positive integer", 400)
    if not warehouse_id:
        return error("warehouse_id must be a positive integer", 400)
    if not quantity:
        return error("quantity must be a positive integer", 400)

    if not can_access_warehouse(g.user, warehouse_id):
        return error("You do not have access to this warehouse", 403)

    note = str(data.get("note") or "").strip() or None
    try:
        result = stock_in(product_id, warehouse_id, quantity, g.user["user_id"], note=note)
    except LookupError as e:
        return error(str(e), 404)
    except Exception as e:
        return error(str(e), 400)

    return jsonify(result), 201


# ---------------------------------------------------------------------------
# Stock OUT
# ---------------------------------------------------------------------------

@bp.post("/out")
@role_required("admin", "manager", "staff")
def do_stock_out():
    """
    Remove stock from a warehouse.
    manager/staff can only remove from their own warehouse.
    Body: {product_id, warehouse_id, quantity, note?}
    """
    data = request.get_json(silent=True) or {}
    product_id   = to_int(data.get("product_id"), minimum=1)
    warehouse_id = to_int(data.get("warehouse_id"), minimum=1)
    quantity     = to_int(data.get("quantity"), minimum=1)

    if not product_id:
        return error("product_id must be a positive integer", 400)
    if not warehouse_id:
        return error("warehouse_id must be a positive integer", 400)
    if not quantity:
        return error("quantity must be a positive integer", 400)

    if not can_access_warehouse(g.user, warehouse_id):
        return error("You do not have access to this warehouse", 403)

    note = str(data.get("note") or "").strip() or None
    try:
        result = stock_out(product_id, warehouse_id, quantity, g.user["user_id"], note=note)
    except LookupError as e:
        return error(str(e), 404)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        return error(str(e), 400)

    return jsonify(result)


# ---------------------------------------------------------------------------
# Transfer
# ---------------------------------------------------------------------------

@bp.post("/transfer")
@role_required("admin", "manager", "staff")
def do_transfer():
    """
    Transfer stock between warehouses.
    admin: any source/destination.
    manager/staff: source warehouse must be their own warehouse.
    Body: {product_id, from_warehouse_id, to_warehouse_id, quantity, note?}
    """
    data = request.get_json(silent=True) or {}
    product_id    = to_int(data.get("product_id"), minimum=1)
    from_wh       = to_int(data.get("from_warehouse_id"), minimum=1)
    to_wh         = to_int(data.get("to_warehouse_id"), minimum=1)
    quantity      = to_int(data.get("quantity"), minimum=1)

    if not product_id:
        return error("product_id must be a positive integer", 400)
    if not from_wh:
        return error("from_warehouse_id must be a positive integer", 400)
    if not to_wh:
        return error("to_warehouse_id must be a positive integer", 400)
    if not quantity:
        return error("quantity must be a positive integer", 400)

    if not can_access_warehouse(g.user, from_wh):
        return error("You do not have access to the source warehouse", 403)

    note = str(data.get("note") or "").strip() or None
    try:
        result = transfer(product_id, from_wh, to_wh, quantity, g.user["user_id"], note=note)
    except LookupError as e:
        return error(str(e), 404)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        return error(str(e), 400)

    return jsonify(result)


# ---------------------------------------------------------------------------
# Movement history
# ---------------------------------------------------------------------------

@bp.get("/movements")
@login_required
def list_movements():
    """
    Movement history.
    manager/staff see only their own warehouse.
    supplier cannot access.
    Optional query params: ?warehouse_id=, ?product_id=, ?type=
    """
    user = g.user
    if user["role"] == "supplier":
        return error("You do not have permission to do this", 403)

    clauses = []
    params = []

    if user["role"] in ("manager", "staff"):
        clauses.append("sm.warehouse_id = %s")
        params.append(user["warehouse_id"])
    else:
        if request.args.get("warehouse_id"):
            wid = to_int(request.args.get("warehouse_id"), minimum=1)
            if wid is None:
                return error("Invalid warehouse_id", 400)
            clauses.append("sm.warehouse_id = %s")
            params.append(wid)

    if request.args.get("product_id"):
        pid = to_int(request.args.get("product_id"), minimum=1)
        if pid is None:
            return error("Invalid product_id", 400)
        clauses.append("sm.product_id = %s")
        params.append(pid)

    valid_types = ("IN", "OUT", "TRANSFER_IN", "TRANSFER_OUT")
    if request.args.get("type"):
        t = request.args.get("type").upper()
        if t not in valid_types:
            return error(f"type must be one of: {', '.join(valid_types)}", 400)
        clauses.append("sm.type = %s")
        params.append(t)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    with transaction() as cur:
        cur.execute(MOVEMENT_SELECT + f" {where} ORDER BY sm.created_at DESC", params)
        rows = cur.fetchall()
    return jsonify(rows)


@bp.get("/movements/<int:warehouse_id>")
@login_required
def warehouse_movements(warehouse_id):
    """Movement history for a single warehouse. manager/staff must own it."""
    user = g.user
    if user["role"] == "supplier":
        return error("You do not have permission to do this", 403)
    if not can_access_warehouse(user, warehouse_id):
        return error("You do not have access to this warehouse", 403)

    with transaction() as cur:
        cur.execute(
            MOVEMENT_SELECT + " WHERE sm.warehouse_id = %s ORDER BY sm.created_at DESC",
            (warehouse_id,),
        )
        rows = cur.fetchall()
    return jsonify(rows)
