/**
 * NEXUS WMS — API Client & State Management
 * Connects directly to Flask REST API with automatic JWT handling
 * and seamless fallback demo mode if server is offline.
 */

(function (window) {
  'use strict';

  const STORAGE_KEY_TOKEN = 'nexus_jwt_token';
  const STORAGE_KEY_USER = 'nexus_user_profile';
  const STORAGE_KEY_MOCK_DB = 'nexus_mock_db';

  // Determine base API URL
  const isHttp = window.location.protocol.startsWith('http');
  const BASE_URL = isHttp ? window.location.origin : 'http://127.0.0.1:5000';

  // Demo Credentials Map for instant quick-testing
  const DEMO_ACCOUNTS = {
    admin: { email: 'admin@inv.com', password: 'Pass@123', label: 'Admin (Full Access)' },
    ravi: { email: 'ravi@inv.com', password: 'Pass@123', label: 'Ravi — Manager (Coimbatore Hub)' },
    priya: { email: 'priya@inv.com', password: 'Pass@123', label: 'Priya — Staff (Coimbatore Hub)' },
    karthik: { email: 'karthik@inv.com', password: 'Pass@123', label: 'Karthik — Manager (Chennai Godown)' },
    supplier: { email: 'supplier@abc.com', password: 'Pass@123', label: 'ABC Supplier (ABC Traders)' }
  };

  // Initial Seed Data for offline fallback
  const INITIAL_SEED_DB = {
    categories: [
      { id: 1, name: 'Electronics' },
      { id: 2, name: 'Grocery' },
      { id: 3, name: 'Stationery' }
    ],
    warehouses: [
      { id: 1, name: 'Coimbatore Hub', location: 'Coimbatore, Tamil Nadu', is_active: true },
      { id: 2, name: 'Chennai Godown', location: 'Chennai, Tamil Nadu', is_active: true }
    ],
    suppliers: [
      { id: 1, name: 'ABC Traders', contact: 'abc@traders.com', is_active: true },
      { id: 2, name: 'Sri Murugan Distributors', contact: 'murugan@dist.com', is_active: true }
    ],
    products: [
      { id: 1, sku: 'ELE-001', name: 'Wireless Mouse', category_id: 1, category_name: 'Electronics', price: 499, min_stock: 10, is_active: true },
      { id: 2, sku: 'ELE-002', name: 'USB Keyboard', category_id: 1, category_name: 'Electronics', price: 799, min_stock: 10, is_active: true },
      { id: 3, sku: 'GRO-001', name: 'Basmati Rice 5kg', category_id: 2, category_name: 'Grocery', price: 450, min_stock: 20, is_active: true },
      { id: 4, sku: 'GRO-002', name: 'Sunflower Oil 1L', category_id: 2, category_name: 'Grocery', price: 150, min_stock: 25, is_active: true },
      { id: 5, sku: 'STA-001', name: 'A4 Paper Ream', category_id: 3, category_name: 'Stationery', price: 280, min_stock: 15, is_active: true },
      { id: 6, sku: 'STA-002', name: 'Ball Pen Box', category_id: 3, category_name: 'Stationery', price: 120, min_stock: 30, is_active: true }
    ],
    inventory: [
      { product_id: 1, warehouse_id: 1, quantity: 50 },
      { product_id: 2, warehouse_id: 1, quantity: 8 },  // low stock
      { product_id: 3, warehouse_id: 1, quantity: 100 },
      { product_id: 4, warehouse_id: 1, quantity: 40 },
      { product_id: 5, warehouse_id: 1, quantity: 12 }, // low stock
      { product_id: 1, warehouse_id: 2, quantity: 20 },
      { product_id: 3, warehouse_id: 2, quantity: 15 }, // low stock
      { product_id: 4, warehouse_id: 2, quantity: 60 },
      { product_id: 6, warehouse_id: 2, quantity: 80 }
    ],
    purchase_orders: [
      {
        id: 1,
        supplier_id: 1,
        supplier_name: 'ABC Traders',
        warehouse_id: 1,
        warehouse_name: 'Coimbatore Hub',
        product_id: 2,
        product_name: 'USB Keyboard',
        sku: 'ELE-002',
        quantity: 50,
        unit_price: 750.00,
        status: 'Created',
        created_by: 2,
        created_by_name: 'Ravi (Manager)',
        created_at: new Date().toISOString(),
        received_at: null
      }
    ],
    stock_movements: [
      { id: 1, product_id: 1, product_name: 'Wireless Mouse', sku: 'ELE-001', warehouse_id: 1, warehouse_name: 'Coimbatore Hub', type: 'IN', quantity: 50, user_id: 1, user_name: 'Admin', note: 'Opening stock', created_at: new Date(Date.now() - 86400000).toISOString() },
      { id: 2, product_id: 2, product_name: 'USB Keyboard', sku: 'ELE-002', warehouse_id: 1, warehouse_name: 'Coimbatore Hub', type: 'IN', quantity: 8, user_id: 1, user_name: 'Admin', note: 'Opening stock', created_at: new Date(Date.now() - 86400000).toISOString() },
      { id: 3, product_id: 3, product_name: 'Basmati Rice 5kg', sku: 'GRO-001', warehouse_id: 1, warehouse_name: 'Coimbatore Hub', type: 'IN', quantity: 100, user_id: 1, user_name: 'Admin', note: 'Opening stock', created_at: new Date(Date.now() - 86400000).toISOString() },
      { id: 4, product_id: 5, product_name: 'A4 Paper Ream', sku: 'STA-001', warehouse_id: 1, warehouse_name: 'Coimbatore Hub', type: 'IN', quantity: 12, user_id: 1, user_name: 'Admin', note: 'Opening stock', created_at: new Date(Date.now() - 86400000).toISOString() }
    ],
    users: [
      { id: 1, name: 'Admin', email: 'admin@inv.com', role: 'admin', warehouse_id: null, warehouse_name: null, supplier_id: null, supplier_name: null, is_active: true },
      { id: 2, name: 'Ravi (Manager)', email: 'ravi@inv.com', role: 'manager', warehouse_id: 1, warehouse_name: 'Coimbatore Hub', supplier_id: null, supplier_name: null, is_active: true },
      { id: 3, name: 'Priya (Staff)', email: 'priya@inv.com', role: 'staff', warehouse_id: 1, warehouse_name: 'Coimbatore Hub', supplier_id: null, supplier_name: null, is_active: true },
      { id: 4, name: 'Karthik (Manager)', email: 'karthik@inv.com', role: 'manager', warehouse_id: 2, warehouse_name: 'Chennai Godown', supplier_id: null, supplier_name: null, is_active: true },
      { id: 5, name: 'ABC Supplier', email: 'supplier@abc.com', role: 'supplier', warehouse_id: null, warehouse_name: null, supplier_id: 1, supplier_name: 'ABC Traders', is_active: true }
    ]
  };

  class ApiClient {
    constructor() {
      this.baseUrl = BASE_URL;
      this.isLive = false;
      this.onAuthChange = null;
      this.mockDb = this.loadMockDb();
    }

    loadMockDb() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_MOCK_DB);
        return saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(INITIAL_SEED_DB));
      } catch (e) {
        return JSON.parse(JSON.stringify(INITIAL_SEED_DB));
      }
    }

    saveMockDb() {
      try {
        localStorage.setItem(STORAGE_KEY_MOCK_DB, JSON.stringify(this.mockDb));
      } catch (e) {
        console.warn('Could not save to localStorage', e);
      }
    }

    resetMockDb() {
      this.mockDb = JSON.parse(JSON.stringify(INITIAL_SEED_DB));
      this.saveMockDb();
    }

    getToken() {
      return localStorage.getItem(STORAGE_KEY_TOKEN) || null;
    }

    getUser() {
      const u = localStorage.getItem(STORAGE_KEY_USER);
      return u ? JSON.parse(u) : null;
    }

    setAuth(token, user) {
      if (token) localStorage.setItem(STORAGE_KEY_TOKEN, token);
      if (user) localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      if (this.onAuthChange) this.onAuthChange(user);
    }

    clearAuth() {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_USER);
      if (this.onAuthChange) this.onAuthChange(null);
    }

    async checkHealth() {
      try {
        const res = await fetch(`${this.baseUrl}/health`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          const data = await res.json();
          this.isLive = data.status === 'ok' && data.database === 'connected';
          return this.isLive;
        }
      } catch (err) {
        this.isLive = false;
      }
      return false;
    }

    async request(path, options = {}) {
      const url = `${this.baseUrl}${path}`;
      const headers = {
        'Accept': 'application/json',
        ...(options.headers || {})
      };

      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }

      try {
        const response = await fetch(url, { ...options, headers });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          if (response.status === 401) {
            // Token expired or invalid
            this.clearAuth();
          }
          const errorMsg = (data && data.error) ? data.error : `HTTP ${response.status}: ${response.statusText}`;
          const err = new Error(errorMsg);
          err.status = response.status;
          err.data = data;
          throw err;
        }

        return data;
      } catch (err) {
        // If connection fails, and we want seamless demo fallback
        if (err.name === 'TypeError' || err.name === 'TimeoutError') {
          console.warn(`[API] Connection to ${url} failed. Routing through fallback mock handler.`);
          return this.fallbackRequest(path, options);
        }
        throw err;
      }
    }

    // ==========================================
    // Concrete API Service Methods
    // ==========================================

    // Auth
    async login(email, password) {
      if (this.isLive) {
        const res = await this.request('/auth/login', {
          method: 'POST',
          body: { email, password }
        });
        this.setAuth(res.token, res.user);
        return res;
      } else {
        return this.mockLogin(email, password);
      }
    }

    async getMe() {
      if (this.isLive) {
        const user = await this.request('/auth/me');
        this.setAuth(this.getToken(), user);
        return user;
      }
      return this.getUser();
    }

    // Categories
    async getCategories() {
      if (this.isLive) return this.request('/categories');
      return this.mockDb.categories;
    }

    // Products
    async getProducts(includeInactive = false) {
      if (this.isLive) {
        const q = includeInactive ? '?include_inactive=true' : '';
        return this.request(`/products${q}`);
      }
      return this.mockDb.products.filter(p => includeInactive || p.is_active);
    }

    async createProduct(data) {
      if (this.isLive) {
        return this.request('/products', { method: 'POST', body: data });
      }
      const newId = (this.mockDb.products.length ? Math.max(...this.mockDb.products.map(p => p.id)) : 0) + 1;
      const cat = this.mockDb.categories.find(c => c.id === parseInt(data.category_id));
      const p = {
        id: newId,
        sku: String(data.sku).trim().toUpperCase(),
        name: data.name,
        category_id: data.category_id ? parseInt(data.category_id) : null,
        category_name: cat ? cat.name : null,
        price: parseFloat(data.price),
        min_stock: data.min_stock !== undefined ? parseInt(data.min_stock) : 0,
        is_active: true
      };
      this.mockDb.products.push(p);
      this.saveMockDb();
      return p;
    }

    async updateProduct(id, data) {
      if (this.isLive) {
        return this.request(`/products/${id}`, { method: 'PUT', body: data });
      }
      const idx = this.mockDb.products.findIndex(p => p.id === parseInt(id));
      if (idx === -1) throw new Error('Product not found');
      Object.assign(this.mockDb.products[idx], data);
      this.saveMockDb();
      return this.mockDb.products[idx];
    }

    async deleteProduct(id) {
      if (this.isLive) {
        return this.request(`/products/${id}`, { method: 'DELETE' });
      }
      const p = this.mockDb.products.find(p => p.id === parseInt(id));
      if (p) p.is_active = false;
      this.saveMockDb();
      return { message: 'Deactivated' };
    }

    // Warehouses
    async getWarehouses(includeInactive = false) {
      if (this.isLive) {
        const q = includeInactive ? '?include_inactive=true' : '';
        return this.request(`/warehouses${q}`);
      }
      return this.mockDb.warehouses.filter(w => includeInactive || w.is_active);
    }

    async createWarehouse(data) {
      if (this.isLive) {
        return this.request('/warehouses', { method: 'POST', body: data });
      }
      const newId = (this.mockDb.warehouses.length ? Math.max(...this.mockDb.warehouses.map(w => w.id)) : 0) + 1;
      const w = { id: newId, name: data.name, location: data.location || '', is_active: true };
      this.mockDb.warehouses.push(w);
      this.saveMockDb();
      return w;
    }

    async updateWarehouse(id, data) {
      if (this.isLive) {
        return this.request(`/warehouses/${id}`, { method: 'PUT', body: data });
      }
      const w = this.mockDb.warehouses.find(w => w.id === parseInt(id));
      if (!w) throw new Error('Warehouse not found');
      Object.assign(w, data);
      this.saveMockDb();
      return w;
    }

    async deleteWarehouse(id) {
      if (this.isLive) {
        return this.request(`/warehouses/${id}`, { method: 'DELETE' });
      }
      const w = this.mockDb.warehouses.find(w => w.id === parseInt(id));
      if (w) w.is_active = false;
      this.saveMockDb();
      return { message: 'Deactivated' };
    }

    // Suppliers
    async getSuppliers() {
      if (this.isLive) return this.request('/suppliers');
      return this.mockDb.suppliers.filter(s => s.is_active);
    }

    async createSupplier(data) {
      if (this.isLive) {
        return this.request('/suppliers', { method: 'POST', body: data });
      }
      const newId = (this.mockDb.suppliers.length ? Math.max(...this.mockDb.suppliers.map(s => s.id)) : 0) + 1;
      const s = { id: newId, name: data.name, contact: data.contact || '', is_active: true };
      this.mockDb.suppliers.push(s);
      this.saveMockDb();
      return s;
    }

    async updateSupplier(id, data) {
      if (this.isLive) {
        return this.request(`/suppliers/${id}`, { method: 'PUT', body: data });
      }
      const s = this.mockDb.suppliers.find(s => s.id === parseInt(id));
      if (!s) throw new Error('Supplier not found');
      Object.assign(s, data);
      this.saveMockDb();
      return s;
    }

    async deleteSupplier(id) {
      if (this.isLive) {
        return this.request(`/suppliers/${id}`, { method: 'DELETE' });
      }
      const s = this.mockDb.suppliers.find(s => s.id === parseInt(id));
      if (s) s.is_active = false;
      this.saveMockDb();
      return { message: 'Deactivated' };
    }

    // Stock
    async getStock(warehouseId = null) {
      if (this.isLive) {
        const q = warehouseId ? `?warehouse_id=${warehouseId}` : '';
        return this.request(`/stock${q}`);
      }
      // Mock Stock join calculation
      let rows = [];
      const user = this.getUser();
      const targetWh = (user && (user.role === 'manager' || user.role === 'staff')) ? user.warehouse_id : warehouseId;

      this.mockDb.inventory.forEach(inv => {
        if (targetWh && inv.warehouse_id !== parseInt(targetWh)) return;
        const p = this.mockDb.products.find(x => x.id === inv.product_id);
        const w = this.mockDb.warehouses.find(x => x.id === inv.warehouse_id);
        if (p && w && p.is_active && w.is_active) {
          rows.push({
            product_id: p.id,
            product_name: p.name,
            sku: p.sku,
            min_stock: p.min_stock,
            warehouse_id: w.id,
            warehouse_name: w.name,
            quantity: inv.quantity,
            low_stock: inv.quantity < p.min_stock
          });
        }
      });
      return rows;
    }

    async stockIn(data) {
      if (this.isLive) {
        return this.request('/stock/in', { method: 'POST', body: data });
      }
      const pid = parseInt(data.product_id);
      const wid = parseInt(data.warehouse_id);
      const qty = parseInt(data.quantity);
      let cell = this.mockDb.inventory.find(i => i.product_id === pid && i.warehouse_id === wid);
      if (!cell) {
        cell = { product_id: pid, warehouse_id: wid, quantity: 0 };
        this.mockDb.inventory.push(cell);
      }
      cell.quantity += qty;

      const p = this.mockDb.products.find(x => x.id === pid);
      const w = this.mockDb.warehouses.find(x => x.id === wid);
      const user = this.getUser() || { id: 1, name: 'Admin' };

      const movId = (this.mockDb.stock_movements.length ? Math.max(...this.mockDb.stock_movements.map(m => m.id)) : 0) + 1;
      this.mockDb.stock_movements.unshift({
        id: movId,
        product_id: pid,
        product_name: p ? p.name : 'Unknown',
        sku: p ? p.sku : '---',
        warehouse_id: wid,
        warehouse_name: w ? w.name : 'Unknown',
        type: 'IN',
        quantity: qty,
        user_id: user.id,
        user_name: user.name,
        po_id: null,
        note: data.note || 'Manual Stock IN',
        created_at: new Date().toISOString()
      });
      this.saveMockDb();
      return { quantity: cell.quantity, movement_id: movId };
    }

    async stockOut(data) {
      if (this.isLive) {
        return this.request('/stock/out', { method: 'POST', body: data });
      }
      const pid = parseInt(data.product_id);
      const wid = parseInt(data.warehouse_id);
      const qty = parseInt(data.quantity);
      const cell = this.mockDb.inventory.find(i => i.product_id === pid && i.warehouse_id === wid);
      if (!cell || cell.quantity < qty) {
        throw new Error(`Insufficient stock: ${cell ? cell.quantity : 0} available`);
      }
      cell.quantity -= qty;

      const p = this.mockDb.products.find(x => x.id === pid);
      const w = this.mockDb.warehouses.find(x => x.id === wid);
      const user = this.getUser() || { id: 1, name: 'Admin' };

      const movId = (this.mockDb.stock_movements.length ? Math.max(...this.mockDb.stock_movements.map(m => m.id)) : 0) + 1;
      this.mockDb.stock_movements.unshift({
        id: movId,
        product_id: pid,
        product_name: p ? p.name : 'Unknown',
        sku: p ? p.sku : '---',
        warehouse_id: wid,
        warehouse_name: w ? w.name : 'Unknown',
        type: 'OUT',
        quantity: qty,
        user_id: user.id,
        user_name: user.name,
        po_id: null,
        note: data.note || 'Manual Stock OUT',
        created_at: new Date().toISOString()
      });
      this.saveMockDb();
      return { quantity: cell.quantity, movement_id: movId };
    }

    async transfer(data) {
      if (this.isLive) {
        return this.request('/stock/transfer', { method: 'POST', body: data });
      }
      const pid = parseInt(data.product_id);
      const srcWid = parseInt(data.from_warehouse_id);
      const dstWid = parseInt(data.to_warehouse_id);
      const qty = parseInt(data.quantity);

      if (srcWid === dstWid) throw new Error('Cannot transfer to the same warehouse');
      let srcCell = this.mockDb.inventory.find(i => i.product_id === pid && i.warehouse_id === srcWid);
      if (!srcCell || srcCell.quantity < qty) {
        throw new Error(`Insufficient stock: ${srcCell ? srcCell.quantity : 0} available`);
      }
      let dstCell = this.mockDb.inventory.find(i => i.product_id === pid && i.warehouse_id === dstWid);
      if (!dstCell) {
        dstCell = { product_id: pid, warehouse_id: dstWid, quantity: 0 };
        this.mockDb.inventory.push(dstCell);
      }

      srcCell.quantity -= qty;
      dstCell.quantity += qty;

      const p = this.mockDb.products.find(x => x.id === pid);
      const srcW = this.mockDb.warehouses.find(x => x.id === srcWid);
      const dstW = this.mockDb.warehouses.find(x => x.id === dstWid);
      const user = this.getUser() || { id: 1, name: 'Admin' };

      const baseId = (this.mockDb.stock_movements.length ? Math.max(...this.mockDb.stock_movements.map(m => m.id)) : 0) + 1;
      this.mockDb.stock_movements.unshift(
        {
          id: baseId,
          product_id: pid,
          product_name: p ? p.name : 'Unknown',
          sku: p ? p.sku : '---',
          warehouse_id: srcWid,
          warehouse_name: srcW ? srcW.name : 'Unknown',
          type: 'TRANSFER_OUT',
          quantity: qty,
          user_id: user.id,
          user_name: user.name,
          note: `Transfer to ${dstW ? dstW.name : dstWid}. Note: ${data.note || 'None'}`,
          created_at: new Date().toISOString()
        },
        {
          id: baseId + 1,
          product_id: pid,
          product_name: p ? p.name : 'Unknown',
          sku: p ? p.sku : '---',
          warehouse_id: dstWid,
          warehouse_name: dstW ? dstW.name : 'Unknown',
          type: 'TRANSFER_IN',
          quantity: qty,
          user_id: user.id,
          user_name: user.name,
          note: `Transfer from ${srcW ? srcW.name : srcWid}. Note: ${data.note || 'None'}`,
          created_at: new Date().toISOString()
        }
      );
      this.saveMockDb();
      return {
        source_quantity: srcCell.quantity,
        destination_quantity: dstCell.quantity,
        transfer_out_movement_id: baseId,
        transfer_in_movement_id: baseId + 1
      };
    }

    async getMovements(filters = {}) {
      if (this.isLive) {
        const params = new URLSearchParams();
        if (filters.warehouse_id) params.set('warehouse_id', filters.warehouse_id);
        if (filters.product_id) params.set('product_id', filters.product_id);
        if (filters.type) params.set('type', filters.type);
        const q = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/stock/movements${q}`);
      }
      return this.mockDb.stock_movements.filter(m => {
        if (filters.warehouse_id && m.warehouse_id !== parseInt(filters.warehouse_id)) return false;
        if (filters.product_id && m.product_id !== parseInt(filters.product_id)) return false;
        if (filters.type && m.type !== filters.type) return false;
        return true;
      });
    }

    // Purchase Orders
    async getPurchaseOrders(filters = {}) {
      if (this.isLive) {
        const params = new URLSearchParams();
        if (filters.status) params.set('status', filters.status);
        if (filters.warehouse_id) params.set('warehouse_id', filters.warehouse_id);
        if (filters.supplier_id) params.set('supplier_id', filters.supplier_id);
        const q = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/purchase-orders${q}`);
      }
      const user = this.getUser();
      return this.mockDb.purchase_orders.filter(po => {
        if (user && (user.role === 'manager' || user.role === 'staff') && po.warehouse_id !== user.warehouse_id) return false;
        if (user && user.role === 'supplier' && po.supplier_id !== user.supplier_id) return false;
        if (filters.status && po.status !== filters.status) return false;
        if (filters.warehouse_id && po.warehouse_id !== parseInt(filters.warehouse_id)) return false;
        if (filters.supplier_id && po.supplier_id !== parseInt(filters.supplier_id)) return false;
        return true;
      });
    }

    async createPurchaseOrder(data) {
      if (this.isLive) {
        return this.request('/purchase-orders', { method: 'POST', body: data });
      }
      const s = this.mockDb.suppliers.find(x => x.id === parseInt(data.supplier_id));
      const w = this.mockDb.warehouses.find(x => x.id === parseInt(data.warehouse_id));
      const p = this.mockDb.products.find(x => x.id === parseInt(data.product_id));
      const user = this.getUser() || { id: 1, name: 'Admin' };

      const newId = (this.mockDb.purchase_orders.length ? Math.max(...this.mockDb.purchase_orders.map(o => o.id)) : 0) + 1;
      const po = {
        id: newId,
        supplier_id: parseInt(data.supplier_id),
        supplier_name: s ? s.name : 'Supplier',
        warehouse_id: parseInt(data.warehouse_id),
        warehouse_name: w ? w.name : 'Warehouse',
        product_id: parseInt(data.product_id),
        product_name: p ? p.name : 'Product',
        sku: p ? p.sku : '---',
        quantity: parseInt(data.quantity),
        unit_price: parseFloat(data.unit_price || 0),
        status: 'Created',
        created_by: user.id,
        created_by_name: user.name,
        created_at: new Date().toISOString(),
        received_at: null
      };
      this.mockDb.purchase_orders.unshift(po);
      this.saveMockDb();
      return po;
    }

    async dispatchPurchaseOrder(id) {
      if (this.isLive) {
        return this.request(`/purchase-orders/${id}/dispatch`, { method: 'POST' });
      }
      const po = this.mockDb.purchase_orders.find(o => o.id === parseInt(id));
      if (!po) throw new Error('Purchase order not found');
      if (po.status !== 'Created') throw new Error(`Cannot dispatch PO in status: ${po.status}`);
      po.status = 'Dispatched';
      this.saveMockDb();
      return po;
    }

    async receivePurchaseOrder(id) {
      if (this.isLive) {
        return this.request(`/purchase-orders/${id}/receive`, { method: 'POST' });
      }
      const po = this.mockDb.purchase_orders.find(o => o.id === parseInt(id));
      if (!po) throw new Error('Purchase order not found');
      if (po.status !== 'Dispatched') throw new Error('PO must be Dispatched before it can be Received');
      po.status = 'Received';
      po.received_at = new Date().toISOString();

      // Automatically triggers stock in
      let cell = this.mockDb.inventory.find(i => i.product_id === po.product_id && i.warehouse_id === po.warehouse_id);
      if (!cell) {
        cell = { product_id: po.product_id, warehouse_id: po.warehouse_id, quantity: 0 };
        this.mockDb.inventory.push(cell);
      }
      cell.quantity += po.quantity;

      const user = this.getUser() || { id: 1, name: 'Admin' };
      const movId = (this.mockDb.stock_movements.length ? Math.max(...this.mockDb.stock_movements.map(m => m.id)) : 0) + 1;
      this.mockDb.stock_movements.unshift({
        id: movId,
        product_id: po.product_id,
        product_name: po.product_name,
        sku: po.sku,
        warehouse_id: po.warehouse_id,
        warehouse_name: po.warehouse_name,
        type: 'IN',
        quantity: po.quantity,
        user_id: user.id,
        user_name: user.name,
        po_id: po.id,
        note: `Received PO #${po.id}`,
        created_at: new Date().toISOString()
      });

      this.saveMockDb();
      return po;
    }

    async cancelPurchaseOrder(id) {
      if (this.isLive) {
        return this.request(`/purchase-orders/${id}/cancel`, { method: 'POST' });
      }
      const po = this.mockDb.purchase_orders.find(o => o.id === parseInt(id));
      if (!po) throw new Error('Purchase order not found');
      if (po.status === 'Received' || po.status === 'Cancelled') {
        throw new Error(`Cannot cancel PO in status: ${po.status}`);
      }
      po.status = 'Cancelled';
      this.saveMockDb();
      return po;
    }

    // Users
    async getUsers() {
      if (this.isLive) return this.request('/users');
      return this.mockDb.users.filter(u => u.is_active);
    }

    async createUser(data) {
      if (this.isLive) {
        return this.request('/users', { method: 'POST', body: data });
      }
      const newId = (this.mockDb.users.length ? Math.max(...this.mockDb.users.map(u => u.id)) : 0) + 1;
      const w = data.warehouse_id ? this.mockDb.warehouses.find(x => x.id === parseInt(data.warehouse_id)) : null;
      const s = data.supplier_id ? this.mockDb.suppliers.find(x => x.id === parseInt(data.supplier_id)) : null;
      const u = {
        id: newId,
        name: data.name,
        email: data.email,
        role: data.role,
        warehouse_id: data.warehouse_id ? parseInt(data.warehouse_id) : null,
        warehouse_name: w ? w.name : null,
        supplier_id: data.supplier_id ? parseInt(data.supplier_id) : null,
        supplier_name: s ? s.name : null,
        is_active: true
      };
      this.mockDb.users.push(u);
      this.saveMockDb();
      return u;
    }

    async updateUser(id, data) {
      if (this.isLive) {
        return this.request(`/users/${id}`, { method: 'PUT', body: data });
      }
      const u = this.mockDb.users.find(x => x.id === parseInt(id));
      if (!u) throw new Error('User not found');
      Object.assign(u, data);
      this.saveMockDb();
      return u;
    }

    async deleteUser(id) {
      if (this.isLive) {
        return this.request(`/users/${id}`, { method: 'DELETE' });
      }
      const current = this.getUser();
      if (current && current.id === parseInt(id)) {
        throw new Error('You cannot deactivate yourself');
      }
      const u = this.mockDb.users.find(x => x.id === parseInt(id));
      if (u) u.is_active = false;
      this.saveMockDb();
      return { message: 'Deactivated' };
    }

    // Mock Login
    mockLogin(email, password) {
      const e = String(email).trim().toLowerCase();
      const user = this.mockDb.users.find(u => u.email.toLowerCase() === e && u.is_active);
      if (!user || password !== 'Pass@123') {
        throw new Error('Invalid email or password');
      }
      const fakeToken = 'mock_jwt_' + btoa(JSON.stringify({ user_id: user.id, role: user.role }));
      this.setAuth(fakeToken, user);
      return { token: fakeToken, user };
    }
  }

  window.API = new ApiClient();
  window.DEMO_ACCOUNTS = DEMO_ACCOUNTS;

})(window);
