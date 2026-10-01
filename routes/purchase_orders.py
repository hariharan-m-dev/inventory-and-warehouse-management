"""
Purchase Order endpoints.

GET  /purchase-orders                  – list POs (scoped by role)
GET  /purchase-orders/<id>             – single PO
POST /purchase-orders                  – create PO (admin, manager)
POST /purchase-orders/<id>/dispatch    – supplier dispatches their PO
POST /purchase-orders/<id>/receive     – admin/manager receives PO (triggers stock IN)
POST /purchase-orders/<id>/cancel      – admin/manager cancels PO
"""
from flask import Blueprint, g, jsonify, request

from auth.decorators import login_required, role_required
from services.purchase_orders import (
    PO_SELECT,
    create_po,
    list_pos,
    transition_po,
)
from db import transaction
from utils import error, to_int, to_price

bp = Blueprint("purchase_orders", __name__, url_prefix="/purchase-orders")


@bp.get("")
@login_required
def list_purchase_orders():
    """
    Returns POs visible to the caller.
    - admin: all POs
    - manager/staff: their warehouse only
    - supplier: their supplier only
    Optional ?status=, ?warehouse_id=, ?supplier_id=
    """
    status_filter = request.args.get("status") or None
    wid = to_int(request.args.get("warehouse_id") or "", minimum=1)
    sid = to_int(request.args.get("supplier_id") or "", minimum=1)

    valid_statuses = ("Created", "Dispatched", "Received", "Cancelled")
    if status_filter and status_filter not in valid_statuses:
        return error(f"status must be one of: {', '.join(valid_statuses)}", 400)

    pos = list_pos(g.user, status_filter=status_filter,
                   warehouse_id=wid, supplier_id=sid)
    return jsonify(pos)


@bp.get("/<int:po_id>")
@login_required
def get_purchase_order(po_id):
    """Fetch a single PO. Enforces the same visibility rules as list."""
    with transaction() as cur:
        cur.execute(PO_SELECT + " WHERE po.id = %s", (po_id,))
        po = cur.fetchone()
    if not po:
        return error("Not found", 404)

    # Visibility check
    user = g.user
    role = user["role"]
    if role in ("manager", "staff") and po["warehouse_id"] != user.get("warehouse_id"):
        return error("You do not have access to this purchase order", 403)
    if role == "supplier" and po["supplier_id"] != user.get("supplier_id"):
        return error("You do not have access to this purchase order", 403)

    return jsonify(po)


@bp.post("")
@role_required("admin", "manager")
def create_purchase_order():
    """
    Create a new PO in 'Created' status.
    manager can only create POs for their own warehouse.
    Body: {supplier_id, warehouse_id, product_id, quantity, unit_price}
    """
    data = request.get_json(silent=True) or {}

    supplier_id  = to_int(data.get("supplier_id"), minimum=1)
    warehouse_id = to_int(data.get("warehouse_id"), minimum=1)
    product_id   = to_int(data.get("product_id"), minimum=1)
    quantity     = to_int(data.get("quantity"), minimum=1)
    unit_price   = to_price(data.get("unit_price"))

    if not supplier_id:
        return error("supplier_id must be a positive integer", 400)
    if not warehouse_id:
        return error("warehouse_id must be a positive integer", 400)
    if not product_id:
        return error("product_id must be a positive integer", 400)
    if not quantity:
        return error("quantity must be a positive integer", 400)
    if unit_price is None:
        return error("unit_price must be a number >= 0", 400)

    # manager can only create POs for their own warehouse
    if g.user["role"] == "manager" and g.user.get("warehouse_id") != warehouse_id:
        return error("You can only create purchase orders for your own warehouse", 403)

    try:
        po = create_po(supplier_id, warehouse_id, product_id, quantity, unit_price,
                       g.user["user_id"])
    except LookupError as e:
        return error(str(e), 404)
    except Exception as e:
        return error(str(e), 400)

    return jsonify(po), 201


@bp.post("/<int:po_id>/dispatch")
@role_required("supplier")
def dispatch_po(po_id):
    """Supplier marks their PO as Dispatched. No body required."""
    try:
        po = transition_po(po_id, "Dispatched", g.user)
    except LookupError as e:
        return error(str(e), 404)
    except PermissionError as e:
        return error(str(e), 403)
    except ValueError as e:
        return error(str(e), 400)
    return jsonify(po)


@bp.post("/<int:po_id>/receive")
@role_required("admin", "manager")
def receive_po(po_id):
    """
    admin/manager marks PO as Received and triggers stock IN.
    manager must belong to the PO's destination warehouse.
    No body required.
    """
    try:
        po = transition_po(po_id, "Received", g.user)
    except LookupError as e:
        return error(str(e), 404)
    except PermissionError as e:
        return error(str(e), 403)
    except ValueError as e:
        return error(str(e), 400)
    return jsonify(po)


@bp.post("/<int:po_id>/cancel")
@role_required("admin", "manager")
def cancel_po(po_id):
    """
    admin/manager cancels a PO. Only valid from Created or Dispatched.
    manager must belong to the PO's destination warehouse.
    No body required.
    """
    try:
        po = transition_po(po_id, "Cancelled", g.user)
    except LookupError as e:
        return error(str(e), 404)
    except PermissionError as e:
        return error(str(e), 403)
    except ValueError as e:
        return error(str(e), 400)
    return jsonify(po)
