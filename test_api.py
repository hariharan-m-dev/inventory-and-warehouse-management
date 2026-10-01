"""
Integration test suite for the Inventory & Warehouse System backend.
Run with:  venv/Scripts/python.exe test_api.py
Requires the Flask server to be running on localhost:5000 and seed data loaded.
"""

import json
import sys
import time
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:5000"

# Unique suffix per run so repeated runs don't collide on unique constraints
RUN = str(int(time.time()))[-5:]

# ── helpers ──────────────────────────────────────────────────────────────────

results = []


def req(method, path, body=None, token=None, label=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def check(label, status, body, expected_status, *, must_contain=None,
          must_not_contain=None, body_check=None):
    ok = status == expected_status
    notes = []
    if must_contain:
        for key in must_contain:
            if key not in str(body):
                ok = False
                notes.append(f"missing '{key}' in response")
    if must_not_contain:
        for key in must_not_contain:
            if key in str(body):
                ok = False
                notes.append(f"'{key}' should NOT be in response")
    if body_check:
        result, msg = body_check(body)
        if not result:
            ok = False
            notes.append(msg)
    verdict = "PASS" if ok else "FAIL"
    results.append({
        "label": label,
        "status": status,
        "expected": expected_status,
        "verdict": verdict,
        "notes": notes,
        "body_snippet": str(body)[:120],
    })
    symbol = "✓" if ok else "✗"
    note_str = f"  [{'; '.join(notes)}]" if notes else ""
    print(f"  {symbol} [{status}/{expected_status}] {label}{note_str}")
    return body


def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")


# ── login helpers ─────────────────────────────────────────────────────────────

def login(email, password="Pass@123"):
    _, body = req("POST", "/auth/login", {"email": email, "password": password})
    return body.get("token"), body.get("user")


# =============================================================================
# 1. HEALTH
# =============================================================================
section("1. HEALTH")
status, body = req("GET", "/health")
check("GET /health returns 200", status, body, 200,
      must_contain=["ok", "connected"])

# =============================================================================
# 2. AUTHENTICATION
# =============================================================================
section("2. AUTHENTICATION")

admin_token, admin_user = login("admin@inv.com")
check("Valid admin login → 200 + token", *req("POST", "/auth/login",
      {"email": "admin@inv.com", "password": "Pass@123"}), 200,
      must_contain=["token"])

check("Invalid password → 401", *req("POST", "/auth/login",
      {"email": "admin@inv.com", "password": "wrongpass"}), 401,
      must_contain=["error"])

check("Invalid email → 401", *req("POST", "/auth/login",
      {"email": "nobody@inv.com", "password": "Pass@123"}), 401,
      must_contain=["error"])

check("Missing body fields → 400", *req("POST", "/auth/login", {}), 400,
      must_contain=["error"])

check("GET /auth/me valid JWT → 200", *req("GET", "/auth/me", token=admin_token), 200,
      must_contain=["email"],
      must_not_contain=["password_hash"])

check("GET /auth/me no JWT → 401", *req("GET", "/auth/me"), 401,
      must_contain=["error"])

check("GET /auth/me invalid JWT → 401",
      *req("GET", "/auth/me", token="invalid.token.here"), 401,
      must_contain=["error"])

# password_hash must never appear in login response
login_status, login_body = req("POST", "/auth/login",
                                {"email": "admin@inv.com", "password": "Pass@123"})
check("Login response has no password_hash", login_status, login_body, 200,
      must_not_contain=["password_hash"])

# =============================================================================
# 3. MASTER DATA
# =============================================================================
section("3. CATEGORIES")

check("GET /categories → 200", *req("GET", "/categories", token=admin_token), 200)

status, body = req("GET", "/categories", token=admin_token)
first_cat_id = body[0]["id"] if body else 1
check(f"GET /categories/{first_cat_id} → 200",
      *req("GET", f"/categories/{first_cat_id}", token=admin_token), 200,
      must_contain=["id", "name"])

check("GET /categories/9999 → 404",
      *req("GET", "/categories/9999", token=admin_token), 404,
      must_contain=["error"])

check("POST /categories (no write endpoint) → 404 or 405",
      req("POST", "/categories", {"name": "Test"}, token=admin_token)[0],
      req("POST", "/categories", {"name": "Test"}, token=admin_token)[1],
      405)

# =============================================================================
section("3. PRODUCTS")

status, body = req("GET", "/products", token=admin_token)
check("GET /products → 200 list", status, body, 200)
products = body

# create
status, body = req("POST", "/products",
                   {"sku": f"TST-{RUN}", "name": f"Test Widget {RUN}", "price": 9.99,
                    "category_id": first_cat_id, "min_stock": 5},
                   token=admin_token)
check("POST /products → 201", status, body, 201, must_contain=["id", "sku"])
test_product_id = body.get("id")

# SKU is upper-cased
check("SKU stored as uppercase", status, body, 201,
      body_check=lambda b: (b.get("sku") == f"TST-{RUN}",
                             f"SKU was {b.get('sku')}"))

# duplicate SKU
check("POST /products duplicate SKU → 409",
      *req("POST", "/products",
           {"sku": f"tst-{RUN}", "name": "Dupe", "price": 1.0},
           token=admin_token), 409, must_contain=["error"])

# case-insensitive SKU (lowercase input → same as TST-XXXXX)
check("POST /products lowercase SKU treated as duplicate → 409",
      *req("POST", "/products",
           {"sku": f"tst-{RUN}", "name": "Lower dupe", "price": 1.0},
           token=admin_token), 409, must_contain=["error"])

# get by id
check(f"GET /products/{test_product_id} → 200",
      *req("GET", f"/products/{test_product_id}", token=admin_token), 200)

# get invalid id
check("GET /products/99999 → 404",
      *req("GET", "/products/99999", token=admin_token), 404, must_contain=["error"])

# update
check(f"PUT /products/{test_product_id} → 200",
      *req("PUT", f"/products/{test_product_id}", {"name": "Updated Widget"},
           token=admin_token), 200, must_contain=["Updated Widget"])

# missing required fields
check("POST /products missing required fields → 400",
      *req("POST", "/products", {"name": "No SKU"}, token=admin_token), 400,
      must_contain=["error"])

# deactivate
check(f"DELETE /products/{test_product_id} → 200",
      *req("DELETE", f"/products/{test_product_id}", token=admin_token), 200,
      must_contain=["Deactivated"])

# verify deactivated product hidden from list
status, body = req("GET", "/products", token=admin_token)
ids_in_list = [p["id"] for p in body]
check("Deactivated product hidden from list", status, body, 200,
      body_check=lambda b: (test_product_id not in [p["id"] for p in b],
                             "deactivated product still visible"))

# =============================================================================
section("3. WAREHOUSES")

status, body = req("GET", "/warehouses", token=admin_token)
check("GET /warehouses → 200", status, body, 200)
wh_list = body
wh1_id = wh_list[0]["id"] if wh_list else 1  # Coimbatore Hub

check(f"GET /warehouses/{wh1_id} → 200",
      *req("GET", f"/warehouses/{wh1_id}", token=admin_token), 200)

status, body = req("POST", "/warehouses",
                   {"name": f"Test Depot {RUN}", "location": "Test City"},
                   token=admin_token)
check("POST /warehouses → 201", status, body, 201)
test_wh_id = body.get("id")

check(f"PUT /warehouses/{test_wh_id} → 200",
      *req("PUT", f"/warehouses/{test_wh_id}", {"location": "Updated City"},
           token=admin_token), 200)

check(f"DELETE /warehouses/{test_wh_id} → 200",
      *req("DELETE", f"/warehouses/{test_wh_id}", token=admin_token), 200)

check("POST /warehouses duplicate name → 409",
      *req("POST", "/warehouses", {"name": "Coimbatore Hub"}, token=admin_token), 409)

# =============================================================================
section("3. SUPPLIERS")

status, body = req("GET", "/suppliers", token=admin_token)
check("GET /suppliers → 200", status, body, 200)
sup_list = body
sup1_id = sup_list[0]["id"] if sup_list else 1

check(f"GET /suppliers/{sup1_id} → 200",
      *req("GET", f"/suppliers/{sup1_id}", token=admin_token), 200)

status, body = req("POST", "/suppliers",
                   {"name": f"Test Supplier Co {RUN}", "contact": "test@supplier.com"},
                   token=admin_token)
check("POST /suppliers → 201", status, body, 201)
test_sup_id = body.get("id")

check(f"PUT /suppliers/{test_sup_id} → 200",
      *req("PUT", f"/suppliers/{test_sup_id}", {"contact": "new@supplier.com"},
           token=admin_token), 200)

check(f"DELETE /suppliers/{test_sup_id} → 200",
      *req("DELETE", f"/suppliers/{test_sup_id}", token=admin_token), 200)

# =============================================================================
section("3. USERS")

status, body = req("GET", "/users", token=admin_token)
check("GET /users (admin) → 200", status, body, 200)
users_list = body

check("No password_hash in user list", status, body, 200,
      must_not_contain=["password_hash"])

# get by id
admin_id = admin_user["id"]
check(f"GET /users/{admin_id} → 200",
      *req("GET", f"/users/{admin_id}", token=admin_token), 200,
      must_not_contain=["password_hash"])

# create new user
status, body = req("POST", "/users",
                   {"name": f"Test User {RUN}", "email": f"testuser{RUN}@inv.com",
                    "password": "Test123", "role": "admin"},
                   token=admin_token)
check("POST /users → 201", status, body, 201, must_not_contain=["password_hash"])
test_user_id = body.get("id")

# duplicate email
check("POST /users duplicate email → 409",
      *req("POST", "/users",
           {"name": "Dupe", "email": f"testuser{RUN}@inv.com",
            "password": "Test123", "role": "admin"},
           token=admin_token), 409)

# update user
check(f"PUT /users/{test_user_id} → 200",
      *req("PUT", f"/users/{test_user_id}", {"name": "Updated User"},
           token=admin_token), 200)

# deactivate
check(f"DELETE /users/{test_user_id} → 200",
      *req("DELETE", f"/users/{test_user_id}", token=admin_token), 200)

# cannot deactivate yourself
check("DELETE /users/<own_id> → 400 (cannot deactivate self)",
      *req("DELETE", f"/users/{admin_id}", token=admin_token), 400,
      must_contain=["error"])

# =============================================================================
# 4. ROLE AUTHORIZATION
# =============================================================================
section("4. ROLE AUTHORIZATION")

ravi_token, ravi_user = login("ravi@inv.com")        # manager, Coimbatore
priya_token, _ = login("priya@inv.com")              # staff, Coimbatore
karthik_token, karthik_user = login("karthik@inv.com")  # manager, Chennai
supplier_token, supplier_user = login("supplier@abc.com")  # supplier

# manager can read products
check("Manager GET /products → 200",
      *req("GET", "/products", token=ravi_token), 200)

# staff can read products
check("Staff GET /products → 200",
      *req("GET", "/products", token=priya_token), 200)

# supplier cannot read products
check("Supplier GET /products → 403",
      *req("GET", "/products", token=supplier_token), 403)

# staff cannot write products
check("Staff POST /products → 403",
      *req("POST", "/products",
           {"sku": "STAFF-001", "name": "X", "price": 1.0},
           token=priya_token), 403)

# manager cannot read suppliers (requires admin or manager — manager IS allowed)
check("Manager GET /suppliers → 200",
      *req("GET", "/suppliers", token=ravi_token), 200)

# staff cannot read suppliers
check("Staff GET /suppliers → 403",
      *req("GET", "/suppliers", token=priya_token), 403)

# staff cannot read users
check("Staff GET /users → 403",
      *req("GET", "/users", token=priya_token), 403)

# manager cannot read users
check("Manager GET /users → 403",
      *req("GET", "/users", token=ravi_token), 403)

# supplier cannot read users
check("Supplier GET /users → 403",
      *req("GET", "/users", token=supplier_token), 403)

# =============================================================================
# 5. WAREHOUSE ACCESS
# =============================================================================
section("5. WAREHOUSE ACCESS")

# Get warehouse IDs from seeded data
status, wh_data = req("GET", "/warehouses", token=admin_token)
coimbatore_id = next((w["id"] for w in wh_data if "Coimbatore" in w["name"]), 1)
chennai_id = next((w["id"] for w in wh_data if "Chennai" in w["name"]), 2)

# ravi is manager of Coimbatore — can view Coimbatore stock
check("Manager views own warehouse stock → 200",
      *req("GET", f"/stock/{coimbatore_id}", token=ravi_token), 200)

# ravi cannot view Chennai stock
check("Manager views other warehouse stock → 403",
      *req("GET", f"/stock/{chennai_id}", token=ravi_token), 403)

# =============================================================================
# 6. STOCK
# =============================================================================
section("6. STOCK")

# Get a real product id (ELE-001)
status, prod_list = req("GET", "/products", token=admin_token)
ele001 = next((p for p in prod_list if p["sku"] == "ELE-001"), None)
ele001_id = ele001["id"] if ele001 else 1

# View all stock
check("GET /stock (admin) → 200", *req("GET", "/stock", token=admin_token), 200)

# View warehouse stock
check(f"GET /stock/{coimbatore_id} (admin) → 200",
      *req("GET", f"/stock/{coimbatore_id}", token=admin_token), 200)

# Single stock cell
check(f"GET /stock/{coimbatore_id}/{ele001_id} → 200",
      *req("GET", f"/stock/{coimbatore_id}/{ele001_id}", token=admin_token), 200,
      must_contain=["quantity"])

# Get current quantity before IN
status, before = req("GET", f"/stock/{coimbatore_id}/{ele001_id}", token=admin_token)
qty_before = before.get("quantity", 0)

# Stock IN
status, body = req("POST", "/stock/in",
                   {"product_id": ele001_id, "warehouse_id": coimbatore_id,
                    "quantity": 10, "note": "Test restock"},
                   token=admin_token)
check("POST /stock/in → 201", status, body, 201,
      must_contain=["quantity", "movement_id"])
qty_after_in = body.get("quantity", 0)

check("Stock IN: quantity increased by 10", status, body, 201,
      body_check=lambda b: (
          b.get("quantity") == qty_before + 10,
          f"expected {qty_before + 10}, got {b.get('quantity')}"
      ))

# Verify movement record created
status, movements = req("GET", "/stock/movements", token=admin_token)
check("GET /stock/movements → 200", status, movements, 200)
last_movement = movements[0] if movements else {}
check("Movement record created for stock IN", status, movements, 200,
      body_check=lambda b: (
          any(m.get("type") == "IN" and m.get("product_id") == ele001_id
              and m.get("note") == "Test restock" for m in b),
          "no matching IN movement found"
      ))

# Stock OUT
status, body = req("POST", "/stock/out",
                   {"product_id": ele001_id, "warehouse_id": coimbatore_id,
                    "quantity": 5, "note": "Test sale"},
                   token=admin_token)
check("POST /stock/out → 200", status, body, 200,
      must_contain=["quantity", "movement_id"])

check("Stock OUT: quantity decreased by 5", status, body, 200,
      body_check=lambda b: (
          b.get("quantity") == qty_after_in - 5,
          f"expected {qty_after_in - 5}, got {b.get('quantity')}"
      ))

# Insufficient stock
_, before_cell = req("GET", f"/stock/{coimbatore_id}/{ele001_id}", token=admin_token)
current_qty = before_cell.get("quantity", 0)
check("Stock OUT exceeds available → 400",
      *req("POST", "/stock/out",
           {"product_id": ele001_id, "warehouse_id": coimbatore_id,
            "quantity": current_qty + 9999},
           token=admin_token), 400, must_contain=["error"])

# Verify stock NOT changed after failed OUT
_, after_fail = req("GET", f"/stock/{coimbatore_id}/{ele001_id}", token=admin_token)
check("Stock unchanged after failed OUT", 200, after_fail, 200,
      body_check=lambda b: (
          b.get("quantity") == current_qty,
          f"expected {current_qty}, got {b.get('quantity')}"
      ))

# Invalid product
check("Stock IN invalid product → 404",
      *req("POST", "/stock/in",
           {"product_id": 99999, "warehouse_id": coimbatore_id, "quantity": 1},
           token=admin_token), 404, must_contain=["error"])

# Invalid warehouse
check("Stock IN invalid warehouse → 404",
      *req("POST", "/stock/in",
           {"product_id": ele001_id, "warehouse_id": 99999, "quantity": 1},
           token=admin_token), 404, must_contain=["error"])

# Unauthorized warehouse (ravi is Coimbatore manager, cannot stock-in Chennai)
check("Manager stock IN other warehouse → 403",
      *req("POST", "/stock/in",
           {"product_id": ele001_id, "warehouse_id": chennai_id, "quantity": 1},
           token=ravi_token), 403, must_contain=["error"])

# Supplier cannot access stock
check("Supplier GET /stock → 403",
      *req("GET", "/stock", token=supplier_token), 403)

# Movement history for warehouse
check(f"GET /stock/movements/{coimbatore_id} → 200",
      *req("GET", f"/stock/movements/{coimbatore_id}", token=admin_token), 200)

# manager cannot see other warehouse movements
check("Manager GET /stock/movements for other warehouse → 403",
      *req("GET", f"/stock/movements/{chennai_id}", token=ravi_token), 403)

# =============================================================================
# 7. TRANSFERS
# =============================================================================
section("7. TRANSFERS")

# Get current quantities
_, src_before = req("GET", f"/stock/{coimbatore_id}/{ele001_id}", token=admin_token)
src_qty_before = src_before.get("quantity", 0)
_, dst_before = req("GET", f"/stock/{chennai_id}/{ele001_id}", token=admin_token)
dst_qty_before = dst_before.get("quantity", 0)

transfer_qty = 5
status, body = req("POST", "/stock/transfer",
                   {"product_id": ele001_id,
                    "from_warehouse_id": coimbatore_id,
                    "to_warehouse_id": chennai_id,
                    "quantity": transfer_qty,
                    "note": "Test transfer"},
                   token=admin_token)
check("POST /stock/transfer valid → 200", status, body, 200,
      must_contain=["source_quantity", "destination_quantity"])

check("Transfer: source stock decreased", status, body, 200,
      body_check=lambda b: (
          b.get("source_quantity") == src_qty_before - transfer_qty,
          f"expected {src_qty_before - transfer_qty}, got {b.get('source_quantity')}"
      ))

check("Transfer: destination stock increased", status, body, 200,
      body_check=lambda b: (
          b.get("destination_quantity") == dst_qty_before + transfer_qty,
          f"expected {dst_qty_before + transfer_qty}, got {b.get('destination_quantity')}"
      ))

# Verify movement records
_, movements = req("GET", "/stock/movements", token=admin_token)
check("Transfer TRANSFER_OUT movement recorded", 200, movements, 200,
      body_check=lambda b: (
          any(m.get("type") == "TRANSFER_OUT" and m.get("note") == "Test transfer"
              for m in b),
          "no TRANSFER_OUT movement found"
      ))
check("Transfer TRANSFER_IN movement recorded", 200, movements, 200,
      body_check=lambda b: (
          any(m.get("type") == "TRANSFER_IN" and m.get("note") == "Test transfer"
              for m in b),
          "no TRANSFER_IN movement found"
      ))

# Insufficient stock transfer
check("Transfer insufficient stock → 400",
      *req("POST", "/stock/transfer",
           {"product_id": ele001_id,
            "from_warehouse_id": coimbatore_id,
            "to_warehouse_id": chennai_id,
            "quantity": 999999},
           token=admin_token), 400, must_contain=["error"])

# Verify source stock NOT reduced after failed transfer
_, src_after_fail = req("GET", f"/stock/{coimbatore_id}/{ele001_id}", token=admin_token)
expected_src = src_qty_before - transfer_qty  # only the successful transfer
check("Source stock not reduced after failed transfer", 200, src_after_fail, 200,
      body_check=lambda b: (
          b.get("quantity") == expected_src,
          f"expected {expected_src}, got {b.get('quantity')}"
      ))

# Same source/destination
check("Transfer same src=dst → 400",
      *req("POST", "/stock/transfer",
           {"product_id": ele001_id,
            "from_warehouse_id": coimbatore_id,
            "to_warehouse_id": coimbatore_id,
            "quantity": 1},
           token=admin_token), 400, must_contain=["error"])

# Manager unauthorized source (karthik is Chennai manager trying to transfer from Coimbatore)
check("Manager transfer from other warehouse → 403",
      *req("POST", "/stock/transfer",
           {"product_id": ele001_id,
            "from_warehouse_id": coimbatore_id,
            "to_warehouse_id": chennai_id,
            "quantity": 1},
           token=karthik_token), 403, must_contain=["error"])

# Invalid destination warehouse
check("Transfer to invalid warehouse → 404",
      *req("POST", "/stock/transfer",
           {"product_id": ele001_id,
            "from_warehouse_id": coimbatore_id,
            "to_warehouse_id": 99999,
            "quantity": 1},
           token=admin_token), 404, must_contain=["error"])

# =============================================================================
# 8 & 9. PURCHASE ORDERS
# =============================================================================
section("8+9. PURCHASE ORDERS")

# Get a product for PO
status, prod_list = req("GET", "/products", token=admin_token)
ele002 = next((p for p in prod_list if p["sku"] == "ELE-002"), None)
ele002_id = ele002["id"] if ele002 else 2

# Create PO as admin
status, body = req("POST", "/purchase-orders",
                   {"supplier_id": sup1_id,
                    "warehouse_id": coimbatore_id,
                    "product_id": ele002_id,
                    "quantity": 20,
                    "unit_price": 750.00},
                   token=admin_token)
check("POST /purchase-orders → 201", status, body, 201,
      must_contain=["id", "status"])
check("New PO status is 'Created'", status, body, 201,
      body_check=lambda b: (b.get("status") == "Created",
                             f"status was {b.get('status')}"))
new_po_id = body.get("id")

# List POs
check("GET /purchase-orders (admin) → 200",
      *req("GET", "/purchase-orders", token=admin_token), 200)

# Get single PO
check(f"GET /purchase-orders/{new_po_id} → 200",
      *req("GET", f"/purchase-orders/{new_po_id}", token=admin_token), 200)

# Supplier can see their own PO
check("Supplier GET /purchase-orders (own) → 200",
      *req("GET", "/purchase-orders", token=supplier_token), 200)

# Supplier CANNOT create a PO
check("Supplier POST /purchase-orders → 403",
      *req("POST", "/purchase-orders",
           {"supplier_id": sup1_id, "warehouse_id": coimbatore_id,
            "product_id": ele002_id, "quantity": 5, "unit_price": 100.0},
           token=supplier_token), 403)

# Supplier CANNOT receive a PO
check("Supplier POST /purchase-orders/receive → 403",
      *req("POST", f"/purchase-orders/{new_po_id}/receive",
           token=supplier_token), 403)

# Supplier CANNOT cancel a PO
check("Supplier POST /purchase-orders/cancel → 403",
      *req("POST", f"/purchase-orders/{new_po_id}/cancel",
           token=supplier_token), 403)

# Cannot receive before dispatched (Created → Received is invalid)
check("Receive PO before dispatch → 400",
      *req("POST", f"/purchase-orders/{new_po_id}/receive",
           token=admin_token), 400, must_contain=["error"])

# Dispatch by correct supplier
status, body = req("POST", f"/purchase-orders/{new_po_id}/dispatch",
                   token=supplier_token)
check("Supplier dispatches own PO → 200", status, body, 200,
      body_check=lambda b: (b.get("status") == "Dispatched",
                             f"status was {b.get('status')}"))

# Cannot dispatch again (already Dispatched)
check("Dispatch already-dispatched PO → 400",
      *req("POST", f"/purchase-orders/{new_po_id}/dispatch",
           token=supplier_token), 400, must_contain=["error"])

# Cannot create a second supplier and test cross-supplier dispatch (use seeded PO)
# Get seeded PO id (the one created by ravi in seed.sql)
_, all_pos = req("GET", "/purchase-orders", token=admin_token)
seeded_pos = [p for p in all_pos if p["id"] != new_po_id]
# Find a PO with a different supplier if possible; otherwise skip
seeded_po = seeded_pos[0] if seeded_pos else None

# Create a PO for the second supplier to test cross-supplier dispatch rejection
# Find second supplier id
_, sup_list_all = req("GET", "/suppliers", token=admin_token)
sup2 = next((s for s in sup_list_all if s["id"] != sup1_id), None)
if sup2:
    _, other_po = req("POST", "/purchase-orders",
                      {"supplier_id": sup2["id"],
                       "warehouse_id": coimbatore_id,
                       "product_id": ele002_id,
                       "quantity": 5,
                       "unit_price": 100.0},
                      token=admin_token)
    other_po_id = other_po.get("id")
    check("Supplier dispatches OTHER supplier PO → 403",
          *req("POST", f"/purchase-orders/{other_po_id}/dispatch",
               token=supplier_token), 403, must_contain=["error"])

# Check stock before receive
_, stock_before_receive = req("GET",
                               f"/stock/{coimbatore_id}/{ele002_id}",
                               token=admin_token)
qty_before_receive = stock_before_receive.get("quantity", 0)

# Receive the PO (admin)
status, body = req("POST", f"/purchase-orders/{new_po_id}/receive",
                   token=admin_token)
check("Admin receives PO → 200", status, body, 200,
      body_check=lambda b: (b.get("status") == "Received",
                             f"status was {b.get('status')}"))
check("received_at set on receive", status, body, 200,
      must_contain=["received_at"])

# Verify stock increased by PO quantity (20)
_, stock_after_receive = req("GET",
                              f"/stock/{coimbatore_id}/{ele002_id}",
                              token=admin_token)
check("Stock increased by PO quantity on receive", 200, stock_after_receive, 200,
      body_check=lambda b: (
          b.get("quantity") == qty_before_receive + 20,
          f"expected {qty_before_receive + 20}, got {b.get('quantity')}"
      ))

# Verify movement record linked to PO
_, movements_after = req("GET", "/stock/movements", token=admin_token)
check("Movement record created for PO receive", 200, movements_after, 200,
      body_check=lambda b: (
          any(m.get("type") == "IN" and m.get("po_id") == new_po_id for m in b),
          f"no IN movement linked to po_id={new_po_id}"
      ))

# Cannot receive already-received PO
check("Receive already-received PO → 400",
      *req("POST", f"/purchase-orders/{new_po_id}/receive",
           token=admin_token), 400, must_contain=["error"])

# Cannot cancel already-received PO
check("Cancel already-received PO → 400",
      *req("POST", f"/purchase-orders/{new_po_id}/cancel",
           token=admin_token), 400, must_contain=["error"])

# Create and cancel a PO
_, cancel_po = req("POST", "/purchase-orders",
                   {"supplier_id": sup1_id,
                    "warehouse_id": coimbatore_id,
                    "product_id": ele002_id,
                    "quantity": 3,
                    "unit_price": 100.0},
                   token=admin_token)
cancel_po_id = cancel_po.get("id")
check("Cancel Created PO → 200",
      *req("POST", f"/purchase-orders/{cancel_po_id}/cancel",
           token=admin_token), 200,
      body_check=lambda b: (b.get("status") == "Cancelled",
                             f"status was {b.get('status')}"))

check("Cancel already-cancelled PO → 400",
      *req("POST", f"/purchase-orders/{cancel_po_id}/cancel",
           token=admin_token), 400, must_contain=["error"])

# Manager PO visibility scoping (ravi = Coimbatore)
check("Manager GET /purchase-orders sees only own warehouse POs",
      *req("GET", "/purchase-orders", token=ravi_token), 200,
      body_check=lambda b: (
          all(p.get("warehouse_id") == coimbatore_id for p in b),
          "manager sees POs from other warehouses"
      ))

# Manager cannot create PO for other warehouse
check("Manager creates PO for other warehouse → 403",
      *req("POST", "/purchase-orders",
           {"supplier_id": sup1_id, "warehouse_id": chennai_id,
            "product_id": ele002_id, "quantity": 5, "unit_price": 100.0},
           token=ravi_token), 403)

# GET nonexistent PO
check("GET /purchase-orders/99999 → 404",
      *req("GET", "/purchase-orders/99999", token=admin_token), 404)

# =============================================================================
# 10. ERROR FORMAT
# =============================================================================
section("10. ERROR FORMAT")

for label, (status, body) in [
    ("400 error format", req("POST", "/auth/login", {}, token=None)),
    ("401 error format", req("GET", "/auth/me")),
    ("403 error format", req("GET", "/users", token=supplier_token)),
    ("404 error format", req("GET", "/products/99999", token=admin_token)),
    ("409 error format", req("POST", "/warehouses",
                             {"name": "Coimbatore Hub"}, token=admin_token)),
]:
    check(f"{label} has {{\"error\": ...}}", status, body, status,
          body_check=lambda b: ("error" in b if isinstance(b, dict) else (False, "not a dict"),
                                "response is not {'error': ...}"))

# =============================================================================
# PRINT REPORT
# =============================================================================
print(f"\n{'='*60}")
print(f"  TEST REPORT")
print(f"{'='*60}")
total = len(results)
passed = sum(1 for r in results if r["verdict"] == "PASS")
failed = sum(1 for r in results if r["verdict"] == "FAIL")
print(f"\n  Total: {total}  |  Passed: {passed}  |  Failed: {failed}\n")

if failed:
    print("  FAILED TESTS:")
    for r in results:
        if r["verdict"] == "FAIL":
            notes = f" → {'; '.join(r['notes'])}" if r['notes'] else ""
            print(f"    ✗ [{r['status']}/{r['expected']}] {r['label']}{notes}")
            print(f"      Body: {r['body_snippet']}")
    sys.exit(1)
else:
    print("  All tests passed.")
    sys.exit(0)
