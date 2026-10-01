-- Demo data. Run AFTER schema.sql.
-- All demo users have the password:  Pass@123
-- (hashed with bcrypt via pgcrypto, compatible with Python's bcrypt library)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO categories (name) VALUES ('Electronics'), ('Grocery'), ('Stationery');

INSERT INTO warehouses (name, location) VALUES
  ('Coimbatore Hub',  'Coimbatore, Tamil Nadu'),
  ('Chennai Godown',  'Chennai, Tamil Nadu');

INSERT INTO suppliers (name, contact) VALUES
  ('ABC Traders',             'abc@traders.com'),
  ('Sri Murugan Distributors','murugan@dist.com');

INSERT INTO users (name, email, password_hash, role, warehouse_id, supplier_id) VALUES
  ('Admin',          'admin@inv.com',     crypt('Pass@123', gen_salt('bf')), 'admin',    NULL, NULL),
  ('Ravi (Manager)', 'ravi@inv.com',      crypt('Pass@123', gen_salt('bf')), 'manager',  (SELECT id FROM warehouses WHERE name='Coimbatore Hub'), NULL),
  ('Priya (Staff)',  'priya@inv.com',     crypt('Pass@123', gen_salt('bf')), 'staff',    (SELECT id FROM warehouses WHERE name='Coimbatore Hub'), NULL),
  ('Karthik (Manager)','karthik@inv.com', crypt('Pass@123', gen_salt('bf')), 'manager',  (SELECT id FROM warehouses WHERE name='Chennai Godown'), NULL),
  ('ABC Supplier',   'supplier@abc.com',  crypt('Pass@123', gen_salt('bf')), 'supplier', NULL, (SELECT id FROM suppliers WHERE name='ABC Traders'));

INSERT INTO products (sku, name, category_id, price, min_stock) VALUES
  ('ELE-001', 'Wireless Mouse',    (SELECT id FROM categories WHERE name='Electronics'), 499, 10),
  ('ELE-002', 'USB Keyboard',      (SELECT id FROM categories WHERE name='Electronics'), 799, 10),
  ('GRO-001', 'Basmati Rice 5kg',  (SELECT id FROM categories WHERE name='Grocery'),     450, 20),
  ('GRO-002', 'Sunflower Oil 1L',  (SELECT id FROM categories WHERE name='Grocery'),     150, 25),
  ('STA-001', 'A4 Paper Ream',     (SELECT id FROM categories WHERE name='Stationery'),  280, 15),
  ('STA-002', 'Ball Pen Box',      (SELECT id FROM categories WHERE name='Stationery'),  120, 30);

-- Opening stock. Some rows are deliberately BELOW min_stock to demo low-stock alerts.
-- Ball Pen Box has no row in Coimbatore on purpose (tests "first-time stock" case).
INSERT INTO inventory (product_id, warehouse_id, quantity)
SELECT p.id, w.id, v.qty
FROM (VALUES
  ('ELE-001','Coimbatore Hub',50),
  ('ELE-002','Coimbatore Hub', 8),   -- low
  ('GRO-001','Coimbatore Hub',100),
  ('GRO-002','Coimbatore Hub',40),
  ('STA-001','Coimbatore Hub',12),   -- low
  ('ELE-001','Chennai Godown',20),
  ('GRO-001','Chennai Godown',15),   -- low
  ('GRO-002','Chennai Godown',60),
  ('STA-002','Chennai Godown',80)
) AS v(sku, wh, qty)
JOIN products p   ON p.sku = v.sku
JOIN warehouses w ON w.name = v.wh;

-- Audit log matches the opening stock, so history and inventory agree
INSERT INTO stock_movements (product_id, warehouse_id, type, quantity, user_id, note)
SELECT product_id, warehouse_id, 'IN', quantity,
       (SELECT id FROM users WHERE email='admin@inv.com'), 'Opening stock'
FROM inventory WHERE quantity > 0;

-- One sample PO so the supplier role has something to dispatch
INSERT INTO purchase_orders (supplier_id, warehouse_id, product_id, quantity, created_by)
VALUES (
  (SELECT id FROM suppliers  WHERE name='ABC Traders'),
  (SELECT id FROM warehouses WHERE name='Coimbatore Hub'),
  (SELECT id FROM products   WHERE sku='ELE-002'),
  50,
  (SELECT id FROM users WHERE email='ravi@inv.com')
);
