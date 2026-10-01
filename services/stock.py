"""
Stock business logic: IN, OUT, TRANSFER.

Every operation that changes inventory MUST go through this module so that:
  - stock_movements is always written alongside inventory changes
  - negative stock is impossible
  - transfers are atomic (single transaction passed in from the route)
"""
from db import transaction
from utils import error


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_inventory(cur, product_id, warehouse_id):
    """Return the current inventory row, or None if it doesn't exist yet."""
    cur.execute(
        "SELECT quantity FROM inventory WHERE product_id = %s AND warehouse_id = %s",
        (product_id, warehouse_id),
    )
    return cur.fetchone()


def _upsert_inventory(cur, product_id, warehouse_id, delta):
    """
    Add delta (positive or negative) to inventory.
    Positive delta (IN): uses INSERT ... ON CONFLICT to handle first-time stock.
    Negative delta (OUT/TRANSFER_OUT): UPDATE only — if row doesn't exist,
      that means 0 stock, which was already checked by the caller.
    Raises ValueError if the result would be negative (DB constraint backup).
    """
    if delta > 0:
        cur.execute(
            """
            INSERT INTO inventory (product_id, warehouse_id, quantity)
            VALUES (%s, %s, %s)
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET quantity = inventory.quantity + %s
            RETURNING quantity
            """,
            (product_id, warehouse_id, delta, delta),
        )
    else:
        # UPDATE only — caller already verified sufficient stock
        cur.execute(
            """
            UPDATE inventory SET quantity = quantity + %s
            WHERE product_id = %s AND warehouse_id = %s
            RETURNING quantity
            """,
            (delta, product_id, warehouse_id),
        )
    row = cur.fetchone()
    if row is None or row["quantity"] < 0:
        raise ValueError("Insufficient stock")


def _record_movement(cur, product_id, warehouse_id, move_type, quantity, user_id,
                     po_id=None, note=None):
    cur.execute(
        """
        INSERT INTO stock_movements
               (product_id, warehouse_id, type, quantity, user_id, po_id, note)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (product_id, warehouse_id, move_type, quantity, user_id, po_id, note),
    )
    return cur.fetchone()["id"]


def _require_product(cur, product_id):
    cur.execute("SELECT id, is_active FROM products WHERE id = %s", (product_id,))
    row = cur.fetchone()
    if not row:
        raise LookupError("Product not found")
    if not row["is_active"]:
        raise LookupError("Product is inactive")


def _require_warehouse(cur, warehouse_id):
    cur.execute("SELECT id, is_active FROM warehouses WHERE id = %s", (warehouse_id,))
    row = cur.fetchone()
    if not row:
        raise LookupError("Warehouse not found")
    if not row["is_active"]:
        raise LookupError("Warehouse is inactive")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def stock_in(product_id, warehouse_id, quantity, user_id, note=None, po_id=None):
    """
    Add stock to a warehouse. Creates the inventory row if it doesn't exist.
    Returns the new inventory quantity and the movement id.
    """
    with transaction() as cur:
        _require_product(cur, product_id)
        _require_warehouse(cur, warehouse_id)
        _upsert_inventory(cur, product_id, warehouse_id, quantity)
        move_id = _record_movement(cur, product_id, warehouse_id, "IN",
                                   quantity, user_id, po_id=po_id, note=note)
        cur.execute(
            "SELECT quantity FROM inventory WHERE product_id = %s AND warehouse_id = %s",
            (product_id, warehouse_id),
        )
        new_qty = cur.fetchone()["quantity"]
    return {"quantity": new_qty, "movement_id": move_id}


def stock_out(product_id, warehouse_id, quantity, user_id, note=None):
    """
    Remove stock from a warehouse.
    Returns 400-style error dict if stock is insufficient, otherwise the new quantity.
    """
    with transaction() as cur:
        _require_product(cur, product_id)
        _require_warehouse(cur, warehouse_id)
        row = _get_inventory(cur, product_id, warehouse_id)
        current = row["quantity"] if row else 0
        if current < quantity:
            raise ValueError(f"Insufficient stock: {current} available")
        _upsert_inventory(cur, product_id, warehouse_id, -quantity)
        move_id = _record_movement(cur, product_id, warehouse_id, "OUT",
                                   quantity, user_id, note=note)
        cur.execute(
            "SELECT quantity FROM inventory WHERE product_id = %s AND warehouse_id = %s",
            (product_id, warehouse_id),
        )
        new_qty = cur.fetchone()["quantity"]
    return {"quantity": new_qty, "movement_id": move_id}


def transfer(product_id, src_warehouse_id, dst_warehouse_id,
             quantity, user_id, note=None):
    """
    Atomically move stock from src to dst warehouse.
    Both inventory rows and both movement records are written in a single transaction.
    If anything fails the entire transaction rolls back.
    """
    if src_warehouse_id == dst_warehouse_id:
        raise ValueError("Source and destination warehouse must be different")

    with transaction() as cur:
        _require_product(cur, product_id)
        _require_warehouse(cur, src_warehouse_id)
        _require_warehouse(cur, dst_warehouse_id)

        # Check available stock before touching anything
        row = _get_inventory(cur, product_id, src_warehouse_id)
        current = row["quantity"] if row else 0
        if current < quantity:
            raise ValueError(f"Insufficient stock in source warehouse: {current} available")

        # Deduct from source
        _upsert_inventory(cur, product_id, src_warehouse_id, -quantity)
        out_id = _record_movement(cur, product_id, src_warehouse_id, "TRANSFER_OUT",
                                  quantity, user_id, note=note)

        # Add to destination
        _upsert_inventory(cur, product_id, dst_warehouse_id, quantity)
        in_id = _record_movement(cur, product_id, dst_warehouse_id, "TRANSFER_IN",
                                 quantity, user_id, note=note)

        # Read final quantities
        cur.execute(
            "SELECT quantity FROM inventory WHERE product_id = %s AND warehouse_id = %s",
            (product_id, src_warehouse_id),
        )
        src_qty = cur.fetchone()["quantity"]

        cur.execute(
            "SELECT quantity FROM inventory WHERE product_id = %s AND warehouse_id = %s",
            (product_id, dst_warehouse_id),
        )
        dst_qty = cur.fetchone()["quantity"]

    return {
        "source_quantity": src_qty,
        "destination_quantity": dst_qty,
        "transfer_out_movement_id": out_id,
        "transfer_in_movement_id": in_id,
    }
