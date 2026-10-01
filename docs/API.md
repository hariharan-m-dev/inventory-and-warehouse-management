# Inventory & Warehouse System — API Reference

**Base URL:** `http://localhost:5000` (same origin when served by Flask)  
**Content-Type:** `application/json` on all POST/PUT requests  
**Authentication:** `Authorization: Bearer <token>` on every protected endpoint  
**Error shape:** always `{"error": "message"}`  
**Soft delete:** DELETE = deactivate (`is_active = false`). Lists hide inactive records.  
Admin can reveal them with `?include_inactive=true`.

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200  | OK |
| 201  | Created |
| 400  | Bad input / business rule violation |
| 401  | Missing, expired, or invalid token |
| 403  | Authenticated but role/warehouse not permitted |
| 404  | Resource not found |
| 405  | Method not allowed |
| 409  | Duplicate (unique constraint) |
| 500  | Unexpected server error |

---

## Roles

| Role | Description |
|------|-------------|
| `admin` | Full access to everything |
| `manager` | Warehouse-scoped: their warehouse only for stock/PO ops |
| `staff` | Warehouse-scoped: read stock + stock IN/OUT for their warehouse |
| `supplier` | Can only dispatch POs belonging to their supplier |

---

## Authentication

### POST /auth/login
No authentication required.

**Body**
```json
{ "email": "admin@inv.com", "password": "Pass@123" }
```

**200 OK**
```json
{
  "token": "<jwt>",
  "user": {
    "id": 1, "name": "Admin", "email": "admin@inv.com", "role": "admin",
    "warehouse_id": null, "warehouse_name": null,
    "supplier_id": null, "supplier_name": null, "is_active": true
  }
}
```

**Errors**
- `400` — email or password missing
- `401` — wrong credentials or inactive account

---

### GET /auth/me
Requires: JWT (any role)

**200 OK** — same user object as login (password_hash excluded)

**Errors**
- `401` — missing/invalid/expired token, or account deactivated since login

---

## Categories (read-only reference data)

### GET /categories
Requires: JWT — admin, manager, staff

**200 OK**
```json
[{ "id": 1, "name": "Electronics" }, ...]
```

### GET /categories/:id
Requires: JWT — admin, manager, staff

**200 OK** `{ "id": 1, "name": "Electronics" }`  
**404** — not found

---

## Products

All write operations: admin only.  
Read: admin, manager, staff.

### GET /products
Query: `?include_inactive=true` (admin only)

**200 OK**
```json
[{
  "id": 1, "sku": "ELE-001", "name": "Wireless Mouse",
  "category_id": 1, "category_name": "Electronics",
  "price": 499.0, "min_stock": 10, "is_active": true
}, ...]
```

### GET /products/:id
**200 OK** — single product object  
**404** — not found

### POST /products
**Body** (all `*` required)
```json
{ "sku": "ELE-003*", "name": "USB Hub*", "price": 299*,
  "category_id": 1, "min_stock": 5 }
```
SKU is automatically upper-cased. `category_id` and `min_stock` are optional.

**201 Created** — full product object  
**400** — missing fields / invalid price or min_stock  
**409** — duplicate SKU

### PUT /products/:id
Send only the fields to change. `is_active: true` reactivates.

**200 OK** — updated product  
**400** — validation error  
**404** — not found  
**409** — duplicate SKU

### DELETE /products/:id
Soft-deactivates the product.

**200 OK** `{ "message": "Deactivated" }`  
**404** — not found

---

## Warehouses

All write operations: admin only.  
Read: admin, manager, staff.

### GET /warehouses
Query: `?include_inactive=true` (admin only)

**200 OK**
```json
[{ "id": 1, "name": "Coimbatore Hub", "location": "Coimbatore, Tamil Nadu", "is_active": true }, ...]
```

### GET /warehouses/:id
**200 OK** — single warehouse  
**404** — not found

### POST /warehouses
**Body:** `{ "name": "*", "location": "" }`

**201 Created** — warehouse object  
**400** — name empty  
**409** — duplicate name

### PUT /warehouses/:id
**200 OK** — updated warehouse  
**404** — not found

### DELETE /warehouses/:id
**200 OK** `{ "message": "Deactivated" }`  
**404** — not found

---

## Suppliers

All write operations: admin only.  
Read: admin, manager.

### GET /suppliers
**200 OK**
```json
[{ "id": 1, "name": "ABC Traders", "contact": "abc@traders.com", "is_active": true }, ...]
```

### GET /suppliers/:id
**200 OK** — single supplier  
**404** — not found

### POST /suppliers
**Body:** `{ "name": "*", "contact": "" }`

**201 Created** — supplier object  
**409** — duplicate name

### PUT /suppliers/:id
**200 OK** — updated supplier  
**404** — not found

### DELETE /suppliers/:id
**200 OK** `{ "message": "Deactivated" }`  
**404** — not found

---

## Users

All operations: admin only. Passwords are never returned.

### GET /users
**200 OK**
```json
[{
  "id": 2, "name": "Ravi (Manager)", "email": "ravi@inv.com", "role": "manager",
  "warehouse_id": 1, "warehouse_name": "Coimbatore Hub",
  "supplier_id": null, "supplier_name": null, "is_active": true
}, ...]
```

### GET /users/:id
**200 OK** — single user  
**404** — not found

### POST /users
**Body**
```json
{
  "name": "*", "email": "*", "password": "*", "role": "*",
  "warehouse_id": null, "supplier_id": null
}
```
Roles: `admin`, `manager`, `staff`, `supplier`  
`manager`/`staff` require `warehouse_id`. `supplier` requires `supplier_id`.  
Password: 6–72 bytes.

**201 Created** — user object (no password_hash)  
**400** — validation / role constraint  
**409** — duplicate email

### PUT /users/:id
**200 OK** — updated user  
**400** — validation error  
**404** — not found

### DELETE /users/:id
**200 OK** `{ "message": "Deactivated" }`  
**400** — cannot deactivate yourself  
**404** — not found

---

## Stock

### GET /stock
Requires: JWT — admin, manager, staff  
Returns all inventory rows. manager/staff automatically see only their own warehouse.  
Admin can filter with `?warehouse_id=<id>`.

**200 OK**
```json
[{
  "product_id": 1, "product_name": "Wireless Mouse", "sku": "ELE-001", "min_stock": 10,
  "warehouse_id": 1, "warehouse_name": "Coimbatore Hub",
  "quantity": 50, "low_stock": false
}, ...]
```

### GET /stock/:warehouse_id
Requires: JWT — admin, manager, staff  
manager/staff must own the warehouse.

**200 OK** — array of inventory rows for that warehouse  
**403** — warehouse access denied

### GET /stock/:warehouse_id/:product_id
Requires: JWT — admin, manager, staff  
Single inventory cell.

**200 OK** — single inventory row  
**403** — warehouse access denied  
**404** — no stock row exists for that combination

### POST /stock/in
Requires: JWT — admin, manager, staff  
manager/staff can only add stock to their own warehouse.

**Body**
```json
{ "product_id": 1, "warehouse_id": 1, "quantity": 20, "note": "Restocking" }
```
`note` is optional. Creates the inventory row if it doesn't exist yet.

**201 Created**
```json
{ "quantity": 70, "movement_id": 11 }
```
**400** — missing/invalid fields  
**403** — warehouse access denied  
**404** — product or warehouse not found / inactive

### POST /stock/out
Requires: JWT — admin, manager, staff  
manager/staff can only remove stock from their own warehouse.

**Body**
```json
{ "product_id": 1, "warehouse_id": 1, "quantity": 5, "note": "Sold" }
```

**200 OK**
```json
{ "quantity": 65, "movement_id": 12 }
```
**400** — insufficient stock (`"Insufficient stock: N available"`) or invalid input  
**403** — warehouse access denied  
**404** — product or warehouse not found

### POST /stock/transfer
Requires: JWT — admin, manager, staff  
admin can transfer between any warehouses.  
manager/staff: `from_warehouse_id` must be their own warehouse.  
The entire operation is a single atomic transaction — partial transfers are impossible.

**Body**
```json
{
  "product_id": 1,
  "from_warehouse_id": 1,
  "to_warehouse_id": 2,
  "quantity": 10,
  "note": "Seasonal rebalance"
}
```

**200 OK**
```json
{
  "source_quantity": 60,
  "destination_quantity": 30,
  "transfer_out_movement_id": 13,
  "transfer_in_movement_id": 14
}
```
**400** — insufficient stock, same source/destination, invalid input  
**403** — source warehouse access denied  
**404** — product or warehouse not found / inactive

### GET /stock/movements
Requires: JWT — admin, manager, staff  
manager/staff see only their warehouse's movements.  
Optional query params: `?warehouse_id=`, `?product_id=`, `?type=IN|OUT|TRANSFER_IN|TRANSFER_OUT`

**200 OK**
```json
[{
  "id": 1, "product_id": 1, "product_name": "Wireless Mouse", "sku": "ELE-001",
  "warehouse_id": 1, "warehouse_name": "Coimbatore Hub",
  "type": "IN", "quantity": 50, "user_id": 1, "user_name": "Admin",
  "po_id": null, "note": "Opening stock", "created_at": "2024-01-01T10:00:00"
}, ...]
```

### GET /stock/movements/:warehouse_id
Requires: JWT — admin, manager, staff  
manager/staff must own the warehouse.

**200 OK** — array of movement rows for that warehouse  
**403** — warehouse access denied

---

## Purchase Orders

Lifecycle: `Created → Dispatched → Received` (terminal)  
`Created` or `Dispatched → Cancelled` (terminal)

### GET /purchase-orders
Requires: JWT — any role  
Scoping:
- admin: all POs
- manager/staff: their warehouse only
- supplier: their supplier only

Optional filters: `?status=Created|Dispatched|Received|Cancelled`, `?warehouse_id=`, `?supplier_id=`

**200 OK**
```json
[{
  "id": 1,
  "supplier_id": 1, "supplier_name": "ABC Traders",
  "warehouse_id": 1, "warehouse_name": "Coimbatore Hub",
  "product_id": 2, "product_name": "USB Keyboard", "sku": "ELE-002",
  "quantity": 50, "unit_price": 750.0,
  "status": "Created",
  "created_by": 2, "created_by_name": "Ravi (Manager)",
  "created_at": "2024-01-01T10:00:00", "received_at": null
}, ...]
```

### GET /purchase-orders/:id
Requires: JWT — any role (same visibility scoping as list)

**200 OK** — single PO object  
**403** — PO does not belong to your warehouse/supplier  
**404** — not found

### POST /purchase-orders
Requires: JWT — admin, manager  
manager can only create POs for their own warehouse.

**Body**
```json
{
  "supplier_id": 1,
  "warehouse_id": 1,
  "product_id": 2,
  "quantity": 50,
  "unit_price": 750.00
}
```

**201 Created** — full PO object  
**400** — missing/invalid fields  
**403** — manager creating PO for another warehouse  
**404** — supplier, warehouse, or product not found / inactive

### POST /purchase-orders/:id/dispatch
Requires: JWT — supplier  
Only the supplier linked to the PO's `supplier_id` can dispatch.

**200 OK** — updated PO object (status: "Dispatched")  
**400** — PO not in "Created" status  
**403** — wrong supplier  
**404** — PO not found

### POST /purchase-orders/:id/receive
Requires: JWT — admin, manager  
manager must belong to the PO's destination warehouse.  
Automatically triggers stock IN and creates a movement record linked to this PO.

**200 OK** — updated PO object (status: "Received", received_at set)  
**400** — PO not in "Dispatched" status  
**403** — manager receiving PO for another warehouse  
**404** — PO not found

### POST /purchase-orders/:id/cancel
Requires: JWT — admin, manager  
Valid from "Created" or "Dispatched". Terminal — cannot be undone.  
manager must belong to the PO's destination warehouse.

**200 OK** — updated PO object (status: "Cancelled")  
**400** — PO already Received or Cancelled  
**403** — manager cancelling PO for another warehouse  
**404** — PO not found

---

## Health

### GET /health
No authentication.

**200 OK**
```json
{ "status": "ok", "database": "connected" }
```

---

## Demo Credentials (seed data, password: `Pass@123`)

| Role | Email |
|------|-------|
| admin | admin@inv.com |
| manager (Coimbatore) | ravi@inv.com |
| staff (Coimbatore) | priya@inv.com |
| manager (Chennai) | karthik@inv.com |
| supplier (ABC Traders) | supplier@abc.com |

---

## Quick Start (browser console)

```js
// 1. Login
const { token } = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@inv.com', password: 'Pass@123' })
}).then(r => r.json());

const auth = { Authorization: 'Bearer ' + token };

// 2. List products
const products = await fetch('/products', { headers: auth }).then(r => r.json());

// 3. Check stock (Coimbatore Hub = warehouse 1)
const stock = await fetch('/stock/1', { headers: auth }).then(r => r.json());

// 4. Stock IN
await fetch('/stock/in', {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ product_id: 1, warehouse_id: 1, quantity: 20, note: 'Restock' })
});

// 5. Transfer
await fetch('/stock/transfer', {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ product_id: 1, from_warehouse_id: 1, to_warehouse_id: 2, quantity: 5 })
});
```
