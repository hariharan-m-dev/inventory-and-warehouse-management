"""
Purchase Order business logic.

Lifecycle:  Created → Dispatched → Received  (terminal)
                     ↘ Cancelled              (terminal from Created or Dispatched)

Rules:
- Only admin/manager can create a PO.
- Only the supplier linked to the PO's supplier_id can dispatch it.
- Only admin/manager of the destination warehouse can mark it Received.
- Receiving a PO automatically calls stock_in and links the movement.
- Cancelled POs cannot be transitioned further.
"""
from db import transaction
from services.stock import _record_movement, _upsert_inventory, _require_product, _require_warehouse

VALID_TRANSITIONS = {
    "Created":    {"Dispatched", "Cancelled"},
    "Dispatched": {"Received",   "Cancelled"},
    "Received":   set(),
    "Cancelled":  set(),
}

PO_SELECT = """
SELECT po.id, po.supplier_id, s.name AS supplier_name,
       po.warehouse_id, w.name AS warehouse_name,
       po.product_id, p.name AS product_name, p.sku,
       po.quantity, po.unit_price::float AS unit_price,
       po.status, po.created_by, u.name AS created_by_name,
       po.created_at, po.received_at
FROM purchase_orders po
JOIN suppliers  s ON s.id = po.supplier_id
JOIN warehouses w ON w.id = po.warehouse_id
JOIN products   p ON p.id = po.product_id
JOIN users      u ON u.id = po.created_by
"""


def _fetch_po(cur, po_id):
    cur.execute(PO_SELECT + " WHERE po.id = %s", (po_id,))
    return cur.fetchone()


def create_po(supplier_id, warehouse_id, product_id, quantity, unit_price, created_by):
    """Create a new PO in 'Created' status. Returns the full PO row."""
    with transaction() as cur:
        _require_product(cur, product_id)
        _require_warehouse(cur, warehouse_id)

        # Validate supplier exists and is active
        cur.execute("SELECT id, is_active FROM suppliers WHERE id = %s", (supplier_id,))
        s = cur.fetchone()
        if not s:
            raise LookupError("Supplier not found")
        if not s["is_active"]:
            raise LookupError("Supplier is inactive")

        cur.execute(
            """
            INSERT INTO purchase_orders
                   (supplier_id, warehouse_id, product_id, quantity, unit_price, created_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (supplier_id, warehouse_id, product_id, quantity, unit_price, created_by),
        )
        new_id = cur.fetchone()["id"]
        return _fetch_po(cur, new_id)


def transition_po(po_id, new_status, acting_user):
    """
    Move a PO to new_status.
    acting_user is the decoded JWT dict (has 'role', 'user_id', 'warehouse_id', 'supplier_id').
    Raises ValueError for invalid transitions or permission problems.
    Returns the updated PO row.
    """
    with transaction() as cur:
        po = _fetch_po(cur, po_id)
        if not po:
            raise LookupError("Purchase order not found")

        current = po["status"]
        if new_status not in VALID_TRANSITIONS.get(current, set()):
            raise ValueError(
                f"Cannot move from '{current}' to '{new_status}'. "
                f"Allowed next states: {sorted(VALID_TRANSITIONS[current]) or 'none'}"
            )

        # --- Permission checks per transition ---
        if new_status == "Dispatched":
            # Only the supplier linked to this PO can dispatch
            if acting_user["role"] != "supplier":
                raise PermissionError("Only supplier users can dispatch a purchase order")
            if acting_user.get("supplier_id") != po["supplier_id"]:
                raise PermissionError("You can only dispatch orders for your own supplier")

        elif new_status == "Received":
            # admin can receive any PO; manager must belong to the destination warehouse
            role = acting_user["role"]
            if role not in ("admin", "manager"):
                raise PermissionError("Only admin or manager can receive a purchase order")
            if role == "manager" and acting_user.get("warehouse_id") != po["warehouse_id"]:
                raise PermissionError(
                    "You can only receive purchase orders for your own warehouse"
                )

        elif new_status == "Cancelled":
            # admin can cancel anything; manager can cancel their warehouse's POs
            role = acting_user["role"]
            if role not in ("admin", "manager"):
                raise PermissionError("Only admin or manager can cancel a purchase order")
            if role == "manager" and acting_user.get("warehouse_id") != po["warehouse_id"]:
                raise PermissionError(
                    "You can only cancel purchase orders for your own warehouse"
                )

        # --- Apply transition ---
        if new_status == "Received":
            # Stock IN and link movement to this PO
            _require_product(cur, po["product_id"])
            _require_warehouse(cur, po["warehouse_id"])
            _upsert_inventory(cur, po["product_id"], po["warehouse_id"], po["quantity"])
            _record_movement(
                cur,
                po["product_id"],
                po["warehouse_id"],
                "IN",
                po["quantity"],
                acting_user["user_id"],
                po_id=po_id,
                note=f"PO #{po_id} received",
            )
            cur.execute(
                "UPDATE purchase_orders SET status = %s, received_at = NOW() WHERE id = %s",
                (new_status, po_id),
            )
        else:
            cur.execute(
                "UPDATE purchase_orders SET status = %s WHERE id = %s",
                (new_status, po_id),
            )

        return _fetch_po(cur, po_id)


def list_pos(acting_user, status_filter=None, warehouse_id=None, supplier_id=None):
    """
    Return POs visible to the acting user.
    - admin: all POs
    - manager/staff: only POs for their warehouse
    - supplier: only POs for their supplier_id
    """
    clauses = []
    params = []

    role = acting_user["role"]
    if role in ("manager", "staff"):
        clauses.append("po.warehouse_id = %s")
        params.append(acting_user["warehouse_id"])
    elif role == "supplier":
        clauses.append("po.supplier_id = %s")
        params.append(acting_user["supplier_id"])

    if status_filter:
        clauses.append("po.status = %s")
        params.append(status_filter)
    if warehouse_id:
        clauses.append("po.warehouse_id = %s")
        params.append(warehouse_id)
    if supplier_id:
        clauses.append("po.supplier_id = %s")
        params.append(supplier_id)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    with transaction() as cur:
        cur.execute(PO_SELECT + f" {where} ORDER BY po.created_at DESC", params)
        return cur.fetchall()
