-- Inventory & Warehouse System: schema
-- Re-runnable: drops everything and recreates it (dev use only!)

DROP TABLE IF EXISTS stock_movements   CASCADE;
DROP TABLE IF EXISTS purchase_orders   CASCADE;
DROP TABLE IF EXISTS inventory         CASCADE;
DROP TABLE IF EXISTS users             CASCADE;
DROP TABLE IF EXISTS products          CASCADE;
DROP TABLE IF EXISTS suppliers         CASCADE;
DROP TABLE IF EXISTS warehouses        CASCADE;
DROP TABLE IF EXISTS categories        CASCADE;

CREATE TABLE categories (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE warehouses (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    location   VARCHAR(150),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE suppliers (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    contact    VARCHAR(150),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE products (
    id           SERIAL PRIMARY KEY,
    sku          VARCHAR(50) NOT NULL UNIQUE,              -- rule 12
    name         VARCHAR(150) NOT NULL,
    category_id  INT REFERENCES categories(id),
    price        NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    min_stock    INT NOT NULL DEFAULT 0 CHECK (min_stock >= 0),  -- low-stock threshold
    is_active    BOOLEAN NOT NULL DEFAULT TRUE             -- soft delete
);

CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    role           VARCHAR(20) NOT NULL CHECK (role IN ('admin','manager','staff','supplier')),
    warehouse_id   INT REFERENCES warehouses(id),
    supplier_id    INT REFERENCES suppliers(id),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    -- manager/staff must belong to a warehouse, supplier must be linked to a supplier
    CONSTRAINT chk_role_link CHECK (
        role = 'admin'
        OR (role IN ('manager','staff') AND warehouse_id IS NOT NULL)
        OR (role = 'supplier' AND supplier_id IS NOT NULL)
    )
);

-- Current quantity of each product in each warehouse.
-- Only changed through stock movements (rule 15).
CREATE TABLE inventory (
    product_id    INT NOT NULL REFERENCES products(id),
    warehouse_id  INT NOT NULL REFERENCES warehouses(id),
    quantity      INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),   -- rule 1: safety net
    PRIMARY KEY (product_id, warehouse_id)
);

CREATE TABLE purchase_orders (
    id            SERIAL PRIMARY KEY,
    supplier_id   INT NOT NULL REFERENCES suppliers(id),
    warehouse_id  INT NOT NULL REFERENCES warehouses(id),
    product_id    INT NOT NULL REFERENCES products(id),
    quantity      INT NOT NULL CHECK (quantity > 0),
    status        VARCHAR(20) NOT NULL DEFAULT 'Created'
                  CHECK (status IN ('Created','Dispatched','Received','Cancelled')),
    created_by    INT NOT NULL REFERENCES users(id),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    received_at   TIMESTAMP
);

-- Append-only audit log. Never update or delete rows here.
CREATE TABLE stock_movements (
    id            SERIAL PRIMARY KEY,
    product_id    INT NOT NULL REFERENCES products(id),
    warehouse_id  INT NOT NULL REFERENCES warehouses(id),
    type          VARCHAR(20) NOT NULL
                  CHECK (type IN ('IN','OUT','TRANSFER_IN','TRANSFER_OUT')),
    quantity      INT NOT NULL CHECK (quantity > 0),
    user_id       INT NOT NULL REFERENCES users(id),
    po_id         INT REFERENCES purchase_orders(id),
    note          VARCHAR(255),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movements_product   ON stock_movements(product_id);
CREATE INDEX idx_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX idx_po_supplier         ON purchase_orders(supplier_id);
