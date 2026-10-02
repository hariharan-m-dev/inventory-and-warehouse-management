/**
 * NEXUS WMS — Main Application Controller (Vanilla JS)
 * Enterprise-grade, clean, robust logic for roles, permissions,
 * operational consoles, live stock validation, PO lifecycle, and audit logs.
 */

(function () {
  'use strict';

  // Application State
  const state = {
    currentUser: null,
    currentView: 'dashboard',
    theme: localStorage.getItem('nexus_theme') || 'dark',
    stockData: [],
    products: [],
    categories: [],
    warehouses: [],
    suppliers: [],
    movements: [],
    purchaseOrders: [],
    users: [],
    filters: {
      stockSearch: '',
      stockWarehouse: '',
      stockLowOnly: false,
      poStatus: 'ALL',
      movementType: 'ALL'
    }
  };

  // DOM Helpers
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Format Helpers
  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Toast Notification System
  function showToast(title, message, type = 'info') {
    const container = $('#toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(title)}</div>
        <div class="toast-msg">${escapeHtml(message)}</div>
      </div>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 250);
    }, 4500);
  }

  // Theme Management
  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();

    const btn = $('#btn-theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', state.theme);
        localStorage.setItem('nexus_theme', state.theme);
        updateThemeIcon();
      });
    }
  }

  function updateThemeIcon() {
    const btn = $('#btn-theme-toggle');
    if (!btn) return;
    if (state.theme === 'dark') {
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
      btn.title = "Switch to Light Mode";
    } else {
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
      btn.title = "Switch to Dark Mode";
    }
  }

  // Server Status
  async function checkBackendStatus() {
    const dot = $('#server-status-dot');
    const label = $('#server-status-label');
    const isLive = await window.API.checkHealth();

    if (isLive) {
      if (dot) {
        dot.className = 'status-dot';
        dot.title = 'Live Flask & PostgreSQL connected';
      }
      if (label) label.textContent = 'Live Flask API';
    } else {
      if (dot) {
        dot.className = 'status-dot warning';
        dot.title = 'Offline mode: demo storage active';
      }
      if (label) label.textContent = 'Demo Mode (Local)';
    }
  }

  // Master Data Preloader (Guarantees data availability)
  async function ensureMasterDataLoaded() {
    const role = state.currentUser ? state.currentUser.role : 'guest';
    const tasks = [];

    // Products: admin, manager, staff
    if (['admin', 'manager', 'staff'].includes(role)) {
      if (!state.products.length) tasks.push(loadProducts().catch(() => {}));
      if (!state.categories.length) tasks.push(loadCategories().catch(() => {}));
    }
    // Warehouses: admin, manager, staff
    if (['admin', 'manager', 'staff'].includes(role)) {
      if (!state.warehouses.length) tasks.push(loadWarehouses().catch(() => {}));
    }
    // Suppliers: admin, manager
    if (['admin', 'manager'].includes(role)) {
      if (!state.suppliers.length) tasks.push(loadSuppliers().catch(() => {}));
    }

    if (tasks.length) {
      await Promise.all(tasks);
      populateAllDropdowns();
    }
  }

  // Populate All Dropdowns (Centralized & Error-Free)
  function populateAllDropdowns() {
    const user = state.currentUser;
    const role = user ? user.role : 'guest';
    const isRestrictedWh = user && (role === 'manager' || role === 'staff');

    // Helper: Fill a warehouse select
    const fillWh = (selectEl, options = {}) => {
      if (!selectEl) return;
      const { allowAll = false, placeholder = 'Select Warehouse...' } = options;
      const currentVal = selectEl.value;

      selectEl.innerHTML = '';
      if (allowAll) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'All Warehouses';
        selectEl.appendChild(opt);
      } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = placeholder;
        selectEl.appendChild(opt);
      }

      state.warehouses.forEach(w => {
        if (!w.is_active) return;
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = `${w.name} (${w.location})`;
        selectEl.appendChild(opt);
      });

      if (isRestrictedWh && !allowAll) {
        selectEl.value = user.warehouse_id;
        selectEl.disabled = true;
      } else {
        selectEl.disabled = false;
        if (currentVal) selectEl.value = currentVal;
      }
    };

    // Helper: Fill a product select
    const fillProd = (selectEl, placeholder = 'Select Product...') => {
      if (!selectEl) return;
      const currentVal = selectEl.value;
      selectEl.innerHTML = `<option value="">${placeholder}</option>`;

      state.products.forEach(p => {
        if (!p.is_active) return;
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.dataset.sku = p.sku;
        opt.dataset.price = p.price;
        opt.textContent = `[${p.sku}] ${p.name} (₹${p.price})`;
        selectEl.appendChild(opt);
      });

      if (currentVal) selectEl.value = currentVal;
    };

    // Helper: Fill a supplier select
    const fillSup = (selectEl, placeholder = 'Select Supplier...') => {
      if (!selectEl) return;
      const currentVal = selectEl.value;
      selectEl.innerHTML = `<option value="">${placeholder}</option>`;

      state.suppliers.forEach(s => {
        if (!s.is_active) return;
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.contact || 'No contact'})`;
        selectEl.appendChild(opt);
      });

      if (currentVal) selectEl.value = currentVal;
    };

    // 1. Stock Inventory Filters
    fillWh($('#filter-stock-warehouse'), { allowAll: true });

    // 2. Direct Stock Operations Console
    fillWh($('#console-in-warehouse'), { placeholder: 'Select Destination Warehouse...' });
    fillProd($('#console-in-product'));

    fillWh($('#console-out-warehouse'), { placeholder: 'Select Source Warehouse...' });
    fillProd($('#console-out-product'));

    fillWh($('#console-tr-from-wh'), { placeholder: 'Select Source Warehouse...' });
    fillProd($('#console-tr-product'));
    updateTransferDestOptions('console');

    // 3. Modals
    fillWh($('#modal-in-warehouse'), { placeholder: 'Select Destination Warehouse...' });
    fillProd($('#modal-in-product'));

    fillWh($('#modal-out-warehouse'), { placeholder: 'Select Source Warehouse...' });
    fillProd($('#modal-out-product'));

    fillWh($('#modal-tr-from-wh'), { placeholder: 'Select Source Warehouse...' });
    fillProd($('#modal-tr-product'));
    updateTransferDestOptions('modal');

    // 4. Purchase Order Modal
    fillSup($('#modal-po-supplier'));
    fillWh($('#modal-po-warehouse'), { placeholder: 'Select Receiving Warehouse...' });
    fillProd($('#modal-po-product'));

    // 5. Product Category Modal
    const catSel = $('#modal-product-category');
    if (catSel) {
      catSel.innerHTML = '<option value="">Select Category...</option>';
      state.categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        catSel.appendChild(opt);
      });
    }

    // 6. User Management Modal
    fillWh($('#modal-user-warehouse'), { placeholder: 'Assign Warehouse...' });
    fillSup($('#modal-user-supplier'), 'Assign Supplier...');
  }

  // Update Destination Warehouse dropdown to exclude Source Warehouse
  function updateTransferDestOptions(prefix) {
    const srcSel = $(`#${prefix}-tr-from-wh`);
    const dstSel = $(`#${prefix}-tr-to-wh`);
    if (!srcSel || !dstSel) return;

    const srcId = parseInt(srcSel.value) || null;
    const currentDst = dstSel.value;

    dstSel.innerHTML = '<option value="">Select Destination Warehouse...</option>';
    state.warehouses.forEach(w => {
      if (!w.is_active || (srcId && w.id === srcId)) return;
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = `${w.name} (${w.location})`;
      dstSel.appendChild(opt);
    });

    if (currentDst && parseInt(currentDst) !== srcId) {
      dstSel.value = currentDst;
    }
  }

  // Live Stock Level Lookup Helper
  function getOnHandStock(warehouseId, productId) {
    const wid = parseInt(warehouseId);
    const pid = parseInt(productId);
    if (!wid || !pid) return 0;
    const item = state.stockData.find(s => s.warehouse_id === wid && s.product_id === pid);
    return item ? item.quantity : 0;
  }

  // Navigation & Routing
  function initNavigation() {
    $$('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.getAttribute('data-view');
        if (targetView) switchView(targetView);
      });
    });

    // Mobile sidebar toggle
    const toggleBtn = $('#btn-mobile-toggle');
    const sidebar = $('#sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }

    // Role switcher dropdown
    const roleSelect = $('#header-role-select');
    if (roleSelect) {
      roleSelect.addEventListener('change', async (e) => {
        const key = e.target.value;
        if (key && window.DEMO_ACCOUNTS[key]) {
          await quickLogin(key);
        }
      });
    }

    // Logout
    const logoutBtn = $('#btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        window.API.clearAuth();
        showToast('Logged Out', 'You have been signed out.', 'info');
        renderAuthUI();
        switchView('dashboard');
      });
    }
  }

  async function switchView(viewName) {
    state.currentView = viewName;

    // Update active nav link
    $$('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-view') === viewName);
    });

    // Update active section
    $$('.view-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `view-${viewName}`);
    });

    // Topbar Title
    const titles = {
      dashboard: { title: 'Operations Dashboard', sub: 'Real-time warehouse KPIs and operational overview' },
      stock: { title: 'Stock Inventory', sub: 'Current product quantities across warehouses' },
      operations: { title: 'Stock Operations Suite', sub: 'Execute Stock IN, Stock OUT, and Inter-Warehouse Transfers' },
      movements: { title: 'Stock Movement Audit Log', sub: 'Immutable audit trail of all inventory events' },
      'purchase-orders': { title: 'Purchase Orders & Procurement', sub: 'Supplier procurement lifecycle & goods receiving' },
      products: { title: 'Master Product Catalog', sub: 'Manage master SKUs, pricing, and safety stock thresholds' },
      warehouses: { title: 'Warehouse Facilities', sub: 'Storage hubs and regional distribution centers' },
      suppliers: { title: 'Suppliers & Vendors', sub: 'Authorized trade suppliers and procurement contacts' },
      users: { title: 'User Management', sub: 'System accounts, assigned warehouses, and role permissions' }
    };

    const info = titles[viewName] || { title: 'Warehouse Management', sub: '' };
    const pageTitle = $('#page-title');
    const pageSub = $('#page-subtitle');
    if (pageTitle) pageTitle.textContent = info.title;
    if (pageSub) pageSub.textContent = info.sub;

    const sidebar = $('#sidebar');
    if (sidebar) sidebar.classList.remove('open');

    await loadViewData(viewName);
  }

  // Load Data for Views (with strict role security checks)
  async function loadViewData(viewName) {
    const user = state.currentUser;
    const role = user ? user.role : 'guest';

    try {
      switch (viewName) {
        case 'dashboard':
          if (role === 'supplier') {
            // Suppliers cannot access stock or movements
            await loadPurchaseOrders();
            renderSupplierDashboard();
          } else {
            await Promise.all([
              loadStock().catch(() => {}),
              loadPurchaseOrders().catch(() => {}),
              loadMovements().catch(() => {})
            ]);
            renderDashboard();
          }
          break;

        case 'stock':
          if (role === 'supplier') {
            showToast('Access Restricted', 'Suppliers do not have access to internal stock levels', 'warning');
            switchView('purchase-orders');
            return;
          }
          await Promise.all([loadStock(), ensureMasterDataLoaded()]);
          renderStockTable();
          break;

        case 'operations':
          if (role === 'supplier') {
            showToast('Access Restricted', 'Suppliers cannot perform internal warehouse stock operations', 'warning');
            switchView('purchase-orders');
            return;
          }
          await Promise.all([loadStock(), ensureMasterDataLoaded()]);
          populateAllDropdowns();
          break;

        case 'movements':
          if (role === 'supplier') {
            showToast('Access Restricted', 'Suppliers do not have access to internal audit movements', 'warning');
            switchView('purchase-orders');
            return;
          }
          await loadMovements();
          renderMovementsTable();
          break;

        case 'purchase-orders':
          if (role === 'supplier') {
            // Supplier only loads their POs
            await loadPurchaseOrders();
          } else {
            // Admin and Manager load POs and master reference data
            await Promise.all([loadPurchaseOrders(), ensureMasterDataLoaded()]);
          }
          renderPurchaseOrders();
          break;

        case 'products':
          if (!['admin', 'manager', 'staff'].includes(role)) {
            switchView('dashboard');
            return;
          }
          await Promise.all([loadProducts(), loadCategories()]);
          renderProductsTable();
          break;

        case 'warehouses':
          if (!['admin', 'manager'].includes(role)) {
            switchView('dashboard');
            return;
          }
          await loadWarehouses();
          renderWarehousesGrid();
          break;

        case 'suppliers':
          if (!['admin', 'manager'].includes(role)) {
            switchView('dashboard');
            return;
          }
          await loadSuppliers();
          renderSuppliersGrid();
          break;

        case 'users':
          if (role !== 'admin') {
            showToast('Access Restricted', 'User management is restricted to Administrators', 'warning');
            switchView('dashboard');
            return;
          }
          await Promise.all([loadUsers(), ensureMasterDataLoaded()]);
          renderUsersTable();
          break;
      }
    } catch (err) {
      showToast('Data Error', err.message || 'Failed to load records', 'error');
    }
  }

  // Auth & Role Enforcement
  function renderAuthUI() {
    const user = window.API.getUser();
    state.currentUser = user;

    const profileChip = $('#user-profile-chip');
    const loginBtn = $('#btn-header-login');
    const roleSelect = $('#header-role-select');

    if (user) {
      if (profileChip) {
        profileChip.style.display = 'flex';
        const nameEl = profileChip.querySelector('.user-name');
        const roleEl = profileChip.querySelector('.user-role-badge');
        const avatarEl = profileChip.querySelector('.user-avatar');

        if (nameEl) nameEl.textContent = user.name;
        if (roleEl) {
          const scope = user.warehouse_name ? ` (${user.warehouse_name})` : (user.supplier_name ? ` (${user.supplier_name})` : '');
          roleEl.textContent = `${user.role.toUpperCase()}${scope}`;
        }
        if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
      }
      if (loginBtn) loginBtn.style.display = 'none';

      if (roleSelect) {
        for (const [key, acc] of Object.entries(window.DEMO_ACCOUNTS)) {
          if (acc.email.toLowerCase() === user.email.toLowerCase()) {
            roleSelect.value = key;
            break;
          }
        }
      }
    } else {
      if (profileChip) profileChip.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (roleSelect) roleSelect.value = '';
    }

    enforcePermissions();
  }

  function enforcePermissions() {
    const user = state.currentUser;
    const role = user ? user.role : 'guest';

    // Show/hide sidebar links according to role
    $$('.nav-link').forEach(link => {
      const v = link.getAttribute('data-view');
      let visible = false;

      if (!user) {
        visible = (v === 'dashboard');
      } else if (role === 'admin') {
        visible = true;
      } else if (role === 'manager') {
        visible = ['dashboard', 'stock', 'operations', 'movements', 'purchase-orders', 'products', 'warehouses', 'suppliers'].includes(v);
      } else if (role === 'staff') {
        visible = ['dashboard', 'stock', 'operations', 'movements'].includes(v);
      } else if (role === 'supplier') {
        visible = ['dashboard', 'purchase-orders'].includes(v);
      }

      link.parentElement.style.display = visible ? 'block' : 'none';
    });

    const masterTitle = $('#nav-title-master');
    const adminTitle = $('#nav-title-admin');
    if (masterTitle) {
      masterTitle.style.display = (role === 'admin' || role === 'manager') ? 'block' : 'none';
    }
    if (adminTitle) {
      adminTitle.style.display = (role === 'admin') ? 'block' : 'none';
    }

    // Role banner
    const banner = $('#role-scope-banner');
    if (banner) {
      if (user && role !== 'admin') {
        banner.style.display = 'flex';
        const txt = banner.querySelector('.banner-text');
        if (txt) {
          if (role === 'manager' || role === 'staff') {
            txt.innerHTML = `<strong>Active Facility:</strong> Operating under <strong>${escapeHtml(user.warehouse_name || 'Warehouse')}</strong> (ID: #${user.warehouse_id}). All operations are scoped to your facility.`;
          } else if (role === 'supplier') {
            txt.innerHTML = `<strong>Vendor Portal:</strong> Authenticated as <strong>${escapeHtml(user.supplier_name || 'Supplier Account')}</strong> (ID: #${user.supplier_id}). You can review incoming orders and accept & dispatch shipments.`;
          }
        }
      } else {
        banner.style.display = 'none';
      }
    }
  }

  // Quick Login
  async function quickLogin(accountKey) {
    const acc = window.DEMO_ACCOUNTS[accountKey];
    if (!acc) return;
    try {
      showToast('Authenticating...', `Logging in as ${acc.label}`, 'info');
      await window.API.login(acc.email, acc.password);
      renderAuthUI();

      // Clear caches so role changes are fresh
      state.products = [];
      state.warehouses = [];
      state.suppliers = [];
      state.categories = [];
      state.stockData = [];
      state.purchaseOrders = [];

      await ensureMasterDataLoaded();

      // If supplier, jump directly to purchase-orders or customized dashboard
      if (acc.email === 'supplier@abc.com') {
        switchView('purchase-orders');
      } else {
        switchView('dashboard');
      }

      showToast('Welcome!', `Active Role: ${acc.label}`, 'success');
    } catch (err) {
      showToast('Login Failed', err.message, 'error');
    }
  }

  // Data Loaders
  async function loadStock() {
    const user = state.currentUser;
    let wid = state.filters.stockWarehouse || null;
    if (user && (user.role === 'manager' || user.role === 'staff')) {
      wid = user.warehouse_id;
    }
    state.stockData = await window.API.getStock(wid);
    updateLowStockBadge();
  }

  async function loadProducts() {
    state.products = await window.API.getProducts(state.currentUser && state.currentUser.role === 'admin');
  }

  async function loadCategories() {
    state.categories = await window.API.getCategories();
  }

  async function loadWarehouses() {
    state.warehouses = await window.API.getWarehouses(true);
  }

  async function loadSuppliers() {
    state.suppliers = await window.API.getSuppliers();
  }

  async function loadMovements() {
    const user = state.currentUser;
    const filters = {};
    if (user && (user.role === 'manager' || user.role === 'staff')) {
      filters.warehouse_id = user.warehouse_id;
    }
    if (state.filters.movementType && state.filters.movementType !== 'ALL') {
      filters.type = state.filters.movementType;
    }
    state.movements = await window.API.getMovements(filters);
  }

  async function loadPurchaseOrders() {
    const filters = {};
    if (state.filters.poStatus && state.filters.poStatus !== 'ALL') {
      filters.status = state.filters.poStatus;
    }
    state.purchaseOrders = await window.API.getPurchaseOrders(filters);
  }

  async function loadUsers() {
    if (state.currentUser && state.currentUser.role === 'admin') {
      state.users = await window.API.getUsers();
    }
  }

  function updateLowStockBadge() {
    const lowCount = state.stockData.filter(item => item.low_stock || item.quantity < item.min_stock).length;
    const badge = $('#sidebar-low-stock-count');
    if (badge) {
      badge.textContent = lowCount;
      badge.style.display = lowCount > 0 ? 'inline-block' : 'none';
    }
  }

  // ==========================================
  // VIEW RENDERERS
  // ==========================================

  // 1. Dashboard View
  function renderDashboard() {
    const totalSKUs = new Set(state.stockData.map(s => s.product_id)).size;
    const totalUnits = state.stockData.reduce((acc, s) => acc + (s.quantity || 0), 0);
    const lowStockCount = state.stockData.filter(s => s.low_stock || s.quantity < s.min_stock).length;
    const activePOs = state.purchaseOrders.filter(po => ['Created', 'Dispatched'].includes(po.status)).length;

    const elSKU = $('#kpi-total-skus');
    const elUnits = $('#kpi-total-units');
    const elLow = $('#kpi-low-stock');
    const elPOs = $('#kpi-active-pos');

    if (elSKU) elSKU.textContent = totalSKUs;
    if (elUnits) elUnits.textContent = totalUnits.toLocaleString();
    if (elLow) elLow.textContent = lowStockCount;
    if (elPOs) elPOs.textContent = activePOs;

    // Low Stock Alert Table
    const lowStockItems = state.stockData.filter(s => s.low_stock || s.quantity < s.min_stock);
    const lowTableBody = $('#dashboard-low-stock-tbody');
    if (lowTableBody) {
      if (lowStockItems.length === 0) {
        lowTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state">
              <div class="empty-state-title" style="color: var(--success-text);">All Stock Levels Healthy</div>
              <div class="empty-state-text">No product inventory is currently below its safety threshold.</div>
            </td>
          </tr>
        `;
      } else {
        lowTableBody.innerHTML = lowStockItems.map(item => `
          <tr class="row-alert">
            <td><span class="badge-sku">${escapeHtml(item.sku)}</span></td>
            <td><strong>${escapeHtml(item.product_name)}</strong></td>
            <td>${escapeHtml(item.warehouse_name)}</td>
            <td class="tabular">
              <span class="badge badge-warning">
                <span class="badge-dot"></span> ${item.quantity} / min ${item.min_stock}
              </span>
            </td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="window.NEXUS.openQuickStockIn(${item.product_id}, ${item.warehouse_id})">
                Restock
              </button>
            </td>
          </tr>
        `).join('');
      }
    }

    // Recent Movements in Dashboard
    const recentMovementsBody = $('#dashboard-recent-movements-tbody');
    if (recentMovementsBody) {
      const recents = state.movements.slice(0, 5);
      if (recents.length === 0) {
        recentMovementsBody.innerHTML = `<tr><td colspan="5" class="empty-state">No recorded movements yet.</td></tr>`;
      } else {
        recentMovementsBody.innerHTML = recents.map(m => `
          <tr>
            <td class="tabular">${formatDate(m.created_at)}</td>
            <td>${renderMovementBadge(m.type)}</td>
            <td><strong>${escapeHtml(m.product_name)}</strong> <span class="badge-sku">${escapeHtml(m.sku)}</span></td>
            <td>${escapeHtml(m.warehouse_name)}</td>
            <td class="tabular"><strong>${m.type === 'OUT' || m.type === 'TRANSFER_OUT' ? '-' : '+'}${m.quantity}</strong></td>
          </tr>
        `).join('');
      }
    }
  }

  // Supplier Customized Dashboard
  function renderSupplierDashboard() {
    const user = state.currentUser;
    const pendingOrders = state.purchaseOrders.filter(po => po.status === 'Created');
    const dispatchedOrders = state.purchaseOrders.filter(po => po.status === 'Dispatched');
    const receivedOrders = state.purchaseOrders.filter(po => po.status === 'Received');
    const totalOrderUnits = state.purchaseOrders.reduce((sum, po) => sum + (po.quantity || 0), 0);

    const elSKU = $('#kpi-total-skus');
    const elUnits = $('#kpi-total-units');
    const elLow = $('#kpi-low-stock');
    const elPOs = $('#kpi-active-pos');

    if (elSKU) elSKU.textContent = pendingOrders.length;
    if (elUnits) elUnits.textContent = totalOrderUnits.toLocaleString();
    if (elLow) elLow.textContent = dispatchedOrders.length;
    if (elPOs) elPOs.textContent = receivedOrders.length;

    // Change labels for vendor context
    const cards = $$('.metric-card');
    if (cards[0]) {
      cards[0].querySelector('.metric-title').textContent = 'Pending Orders';
      cards[0].querySelector('.metric-sub').textContent = 'Orders awaiting your dispatch';
    }
    if (cards[1]) {
      cards[1].querySelector('.metric-title').textContent = 'Total Units Ordered';
      cards[1].querySelector('.metric-sub').textContent = 'Cumulative units across all POs';
    }
    if (cards[2]) {
      cards[2].querySelector('.metric-title').textContent = 'In-Transit Orders';
      cards[2].querySelector('.metric-sub').textContent = 'Dispatched and en route';
    }
    if (cards[3]) {
      cards[3].querySelector('.metric-title').textContent = 'Fulfilled Orders';
      cards[3].querySelector('.metric-sub').textContent = 'Successfully received at warehouse';
    }

    // Pending Orders Table on Dashboard
    const lowTableBody = $('#dashboard-low-stock-tbody');
    if (lowTableBody) {
      if (pendingOrders.length === 0) {
        lowTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state">
              <div class="empty-state-title" style="color: var(--success-text);">No Pending Orders</div>
              <div class="empty-state-text">You have dispatched all incoming purchase orders.</div>
            </td>
          </tr>
        `;
      } else {
        lowTableBody.innerHTML = pendingOrders.map(po => `
          <tr>
            <td><span class="badge-sku">#PO-${po.id}</span></td>
            <td><strong>${escapeHtml(po.product_name)}</strong> <div class="form-hint">${escapeHtml(po.sku)}</div></td>
            <td>${escapeHtml(po.warehouse_name)}</td>
            <td class="tabular"><strong>${po.quantity} units</strong> (₹${po.unit_price}/ea)</td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="window.NEXUS.dispatchPO(${po.id})">
                Accept &amp; Dispatch &rarr;
              </button>
            </td>
          </tr>
        `).join('');
      }
    }
  }

  // 2. Stock Table View
  function renderStockTable() {
    const tbody = $('#stock-table-tbody');
    if (!tbody) return;

    let filtered = state.stockData;
    const query = (state.filters.stockSearch || '').toLowerCase().trim();

    if (query) {
      filtered = filtered.filter(item =>
        item.product_name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        item.warehouse_name.toLowerCase().includes(query)
      );
    }

    if (state.filters.stockLowOnly) {
      filtered = filtered.filter(item => item.low_stock || item.quantity < item.min_stock);
    }

    const countEl = $('#stock-items-count');
    if (countEl) countEl.textContent = `${filtered.length} records`;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
              </svg>
              <div class="empty-state-title">No inventory matching criteria</div>
              <div class="empty-state-text">Try resetting search filters or warehouse selections.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const canOperate = state.currentUser && ['admin', 'manager', 'staff'].includes(state.currentUser.role);

    tbody.innerHTML = filtered.map(item => {
      const isLow = item.low_stock || item.quantity < item.min_stock;
      const isOut = item.quantity === 0;

      let statusBadge = '<span class="badge badge-success"><span class="badge-dot"></span> In Stock</span>';
      if (isOut) {
        statusBadge = '<span class="badge badge-danger"><span class="badge-dot"></span> Out of Stock</span>';
      } else if (isLow) {
        statusBadge = '<span class="badge badge-warning"><span class="badge-dot"></span> Low Stock</span>';
      }

      const maxExpected = Math.max(item.min_stock * 2.5, 20);
      const fillPct = Math.min(100, Math.round((item.quantity / maxExpected) * 100));
      const fillClass = isOut ? 'danger' : (isLow ? 'warning' : '');

      return `
        <tr class="${isLow ? 'row-alert' : ''}">
          <td><span class="badge-sku">${escapeHtml(item.sku)}</span></td>
          <td><strong>${escapeHtml(item.product_name)}</strong></td>
          <td>${escapeHtml(item.warehouse_name)}</td>
          <td class="tabular"><strong>${item.quantity}</strong></td>
          <td class="tabular text-muted">${item.min_stock}</td>
          <td>
            <div class="stock-bar-wrap">
              ${statusBadge}
              <div class="stock-bar-track">
                <div class="stock-bar-fill ${fillClass}" style="width: ${fillPct}%"></div>
              </div>
            </div>
          </td>
          <td>
            ${canOperate ? `
              <div class="panel-actions">
                <button class="btn btn-secondary btn-sm" title="Stock IN" onclick="window.NEXUS.openQuickStockIn(${item.product_id}, ${item.warehouse_id})">
                  + IN
                </button>
                <button class="btn btn-secondary btn-sm" title="Stock OUT" onclick="window.NEXUS.openQuickStockOut(${item.product_id}, ${item.warehouse_id})">
                  - OUT
                </button>
                <button class="btn btn-secondary btn-sm" title="Transfer" onclick="window.NEXUS.openQuickTransfer(${item.product_id}, ${item.warehouse_id})">
                  ⇄ Transfer
                </button>
              </div>
            ` : '<span class="text-dim">View Only</span>'}
          </td>
        </tr>
      `;
    }).join('');
  }

  // 3. Stock Movements Audit Table
  function renderMovementsTable() {
    const tbody = $('#movements-table-tbody');
    if (!tbody) return;

    if (state.movements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No movement audit records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.movements.map(m => `
      <tr>
        <td class="tabular">#${m.id}</td>
        <td class="tabular text-muted">${formatDate(m.created_at)}</td>
        <td>${renderMovementBadge(m.type)}</td>
        <td><strong>${escapeHtml(m.product_name)}</strong> <span class="badge-sku">${escapeHtml(m.sku)}</span></td>
        <td>${escapeHtml(m.warehouse_name)}</td>
        <td class="tabular">
          <strong style="color: ${m.type === 'IN' || m.type === 'TRANSFER_IN' ? 'var(--success-text)' : 'var(--danger-text)'}">
            ${m.type === 'IN' || m.type === 'TRANSFER_IN' ? '+' : '-'}${m.quantity}
          </strong>
        </td>
        <td>
          <span class="user-name" style="font-size: 0.75rem;">${escapeHtml(m.user_name || 'System')}</span>
          ${m.note ? `<div class="form-hint">${escapeHtml(m.note)}</div>` : ''}
        </td>
      </tr>
    `).join('');
  }

  function renderMovementBadge(type) {
    switch (type) {
      case 'IN':
        return '<span class="badge badge-success"><span class="badge-dot"></span> STOCK IN</span>';
      case 'OUT':
        return '<span class="badge badge-danger"><span class="badge-dot"></span> STOCK OUT</span>';
      case 'TRANSFER_IN':
        return '<span class="badge badge-info"><span class="badge-dot"></span> TRANSFER IN</span>';
      case 'TRANSFER_OUT':
        return '<span class="badge badge-warning"><span class="badge-dot"></span> TRANSFER OUT</span>';
      default:
        return `<span class="badge badge-neutral">${escapeHtml(type)}</span>`;
    }
  }

  // 4. Purchase Orders View
  function renderPurchaseOrders() {
    const tbody = $('#po-table-tbody');
    if (!tbody) return;

    const user = state.currentUser;
    const role = user ? user.role : 'guest';

    if (state.purchaseOrders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No purchase orders found matching status.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.purchaseOrders.map(po => {
      const totalAmount = (po.quantity * (po.unit_price || 0));

      let actionButtons = '';
      if (role === 'supplier' && po.status === 'Created') {
        actionButtons = `
          <button class="btn btn-primary btn-sm" onclick="window.NEXUS.dispatchPO(${po.id})">
            Accept &amp; Dispatch
          </button>
        `;
      } else if (['admin', 'manager'].includes(role)) {
        if (po.status === 'Dispatched') {
          // Manager can only receive if destination warehouse matches their assigned warehouse
          const canReceive = role === 'admin' || (user && user.warehouse_id === po.warehouse_id);
          if (canReceive) {
            actionButtons = `
              <button class="btn btn-success btn-sm" onclick="window.NEXUS.receivePO(${po.id})">
                Receive Goods
              </button>
            `;
          }
        }
        if (['Created', 'Dispatched'].includes(po.status)) {
          const canCancel = role === 'admin' || (user && user.warehouse_id === po.warehouse_id);
          if (canCancel) {
            actionButtons += `
              <button class="btn btn-danger btn-sm" style="margin-left: 0.35rem;" onclick="window.NEXUS.cancelPO(${po.id})">
                Cancel
              </button>
            `;
          }
        }
      }

      return `
        <tr>
          <td class="tabular"><strong>#PO-${po.id}</strong></td>
          <td><strong>${escapeHtml(po.supplier_name)}</strong></td>
          <td>${escapeHtml(po.warehouse_name)}</td>
          <td>
            <strong>${escapeHtml(po.product_name)}</strong>
            <div class="badge-sku" style="display:inline-block; font-size: 0.65rem;">${escapeHtml(po.sku)}</div>
          </td>
          <td class="tabular"><strong>${po.quantity}</strong></td>
          <td class="tabular">${formatCurrency(po.unit_price)}</td>
          <td class="tabular"><strong>${formatCurrency(totalAmount)}</strong></td>
          <td>${renderPOStatusBadge(po.status)}</td>
          <td>${actionButtons || '<span class="text-dim">—</span>'}</td>
        </tr>
      `;
    }).join('');
  }

  function renderPOStatusBadge(status) {
    switch (status) {
      case 'Created':
        return '<span class="badge badge-info"><span class="badge-dot"></span> Created</span>';
      case 'Dispatched':
        return '<span class="badge badge-warning"><span class="badge-dot"></span> Dispatched</span>';
      case 'Received':
        return '<span class="badge badge-success"><span class="badge-dot"></span> Received</span>';
      case 'Cancelled':
        return '<span class="badge badge-danger"><span class="badge-dot"></span> Cancelled</span>';
      default:
        return `<span class="badge badge-neutral">${escapeHtml(status)}</span>`;
    }
  }

  // 5. Products Catalog
  function renderProductsTable() {
    const tbody = $('#products-table-tbody');
    if (!tbody) return;

    const isAdmin = state.currentUser && state.currentUser.role === 'admin';

    if (state.products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No products registered in master catalog.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.products.map(p => `
      <tr style="${!p.is_active ? 'opacity: 0.5;' : ''}">
        <td><span class="badge-sku">${escapeHtml(p.sku)}</span></td>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td><span class="badge badge-neutral">${escapeHtml(p.category_name || 'General')}</span></td>
        <td class="tabular">${formatCurrency(p.price)}</td>
        <td class="tabular">${p.min_stock} units</td>
        <td>
          ${p.is_active
            ? '<span class="badge badge-success"><span class="badge-dot"></span> Active</span>'
            : '<span class="badge badge-danger"><span class="badge-dot"></span> Inactive</span>'}
        </td>
        <td>
          ${isAdmin ? `
            <div class="panel-actions">
              <button class="btn btn-secondary btn-sm" onclick="window.NEXUS.openEditProduct(${p.id})">Edit</button>
              ${p.is_active
                ? `<button class="btn btn-danger btn-sm" onclick="window.NEXUS.deleteProduct(${p.id})">Deactivate</button>`
                : `<button class="btn btn-success btn-sm" onclick="window.NEXUS.reactivateProduct(${p.id})">Reactivate</button>`}
            </div>
          ` : '<span class="text-dim">Read Only</span>'}
        </td>
      </tr>
    `).join('');
  }

  // 6. Warehouses Grid
  function renderWarehousesGrid() {
    const container = $('#warehouses-cards-grid');
    if (!container) return;

    const isAdmin = state.currentUser && state.currentUser.role === 'admin';

    container.innerHTML = state.warehouses.map(w => `
      <div class="metric-card" style="${!w.is_active ? 'opacity: 0.5;' : ''}">
        <div class="metric-header">
          <span class="metric-title">Facility #${w.id}</span>
          ${w.is_active
            ? '<span class="badge badge-success"><span class="badge-dot"></span> Active</span>'
            : '<span class="badge badge-danger"><span class="badge-dot"></span> Inactive</span>'}
        </div>
        <div class="metric-value" style="font-size: 1.25rem;">${escapeHtml(w.name)}</div>
        <div class="metric-sub">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${escapeHtml(w.location || 'Location unspecified')}
        </div>
        ${isAdmin ? `
          <div class="panel-actions" style="margin-top: 0.75rem;">
            <button class="btn btn-secondary btn-sm" onclick="window.NEXUS.openEditWarehouse(${w.id})">Edit</button>
            ${w.is_active ? `<button class="btn btn-danger btn-sm" onclick="window.NEXUS.deleteWarehouse(${w.id})">Deactivate</button>` : ''}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  // 7. Suppliers Grid
  function renderSuppliersGrid() {
    const container = $('#suppliers-cards-grid');
    if (!container) return;

    const isAdmin = state.currentUser && state.currentUser.role === 'admin';

    container.innerHTML = state.suppliers.map(s => `
      <div class="metric-card" style="${!s.is_active ? 'opacity: 0.5;' : ''}">
        <div class="metric-header">
          <span class="metric-title">Vendor #${s.id}</span>
          ${s.is_active
            ? '<span class="badge badge-success"><span class="badge-dot"></span> Active</span>'
            : '<span class="badge badge-danger"><span class="badge-dot"></span> Inactive</span>'}
        </div>
        <div class="metric-value" style="font-size: 1.25rem;">${escapeHtml(s.name)}</div>
        <div class="metric-sub">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          ${escapeHtml(s.contact || 'No contact on file')}
        </div>
        ${isAdmin ? `
          <div class="panel-actions" style="margin-top: 0.75rem;">
            <button class="btn btn-secondary btn-sm" onclick="window.NEXUS.openEditSupplier(${s.id})">Edit</button>
            ${s.is_active ? `<button class="btn btn-danger btn-sm" onclick="window.NEXUS.deleteSupplier(${s.id})">Deactivate</button>` : ''}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  // 8. Users Table
  function renderUsersTable() {
    const tbody = $('#users-table-tbody');
    if (!tbody) return;

    tbody.innerHTML = state.users.map(u => `
      <tr style="${!u.is_active ? 'opacity: 0.5;' : ''}">
        <td class="tabular">#${u.id}</td>
        <td><strong>${escapeHtml(u.name)}</strong></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge badge-info">${escapeHtml(u.role.toUpperCase())}</span></td>
        <td>${escapeHtml(u.warehouse_name || u.supplier_name || 'Global Access')}</td>
        <td>
          ${u.is_active
            ? '<span class="badge badge-success"><span class="badge-dot"></span> Active</span>'
            : '<span class="badge badge-danger"><span class="badge-dot"></span> Inactive</span>'}
        </td>
        <td>
          ${u.id !== state.currentUser.id && u.is_active ? `
            <button class="btn btn-danger btn-sm" onclick="window.NEXUS.deleteUser(${u.id})">Deactivate</button>
          ` : '<span class="text-dim">—</span>'}
        </td>
      </tr>
    `).join('');
  }

  // ==========================================
  // DIRECT CONSOLES & MODALS EVENT BINDING
  // ==========================================

  function openModal(modalId) {
    const modal = $(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = $(modalId);
    if (modal) modal.classList.remove('active');
  }

  function initModalsAndConsoles() {
    // Backdrop close
    $$('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
      const closeBtn = modal.querySelector('.modal-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
      }
    });

    // ----------------------------------------------------
    // Stock IN: Console & Modal Live Sync
    // ----------------------------------------------------
    const bindStockInLiveCalc = (whId, prodId, qtyId, badgeId, currentQtyId, previewId, projId) => {
      const update = () => {
        const wid = $(whId)?.value;
        const pid = $(prodId)?.value;
        const qty = parseInt($(qtyId)?.value) || 0;

        if (wid && pid) {
          const onHand = getOnHandStock(wid, pid);
          if ($(badgeId)) $(badgeId).style.display = 'block';
          if ($(currentQtyId)) $(currentQtyId).textContent = `${onHand} units`;

          if (qty > 0) {
            if ($(previewId)) $(previewId).style.display = 'block';
            if ($(projId)) $(projId).textContent = `${onHand + qty} units (+${qty})`;
          } else {
            if ($(previewId)) $(previewId).style.display = 'none';
          }
        } else {
          if ($(badgeId)) $(badgeId).style.display = 'none';
          if ($(previewId)) $(previewId).style.display = 'none';
        }
      };

      $(whId)?.addEventListener('change', update);
      $(prodId)?.addEventListener('change', update);
      $(qtyId)?.addEventListener('input', update);
    };

    bindStockInLiveCalc(
      '#console-in-warehouse', '#console-in-product', '#console-in-qty',
      '#console-in-stock-badge', '#console-in-current-qty', '#console-in-preview', '#console-in-projected'
    );
    bindStockInLiveCalc(
      '#modal-in-warehouse', '#modal-in-product', '#modal-in-qty',
      '#modal-in-stock-badge', '#modal-in-current-qty', '#modal-in-preview', '#modal-in-projected'
    );

    // ----------------------------------------------------
    // Stock OUT: Console & Modal Live Sync & Validation
    // ----------------------------------------------------
    const bindStockOutLiveCalc = (whId, prodId, qtyId, badgeId, currentQtyId, previewId, projId, btnSubmit) => {
      const update = () => {
        const wid = $(whId)?.value;
        const pid = $(prodId)?.value;
        const qty = parseInt($(qtyId)?.value) || 0;

        if (wid && pid) {
          const onHand = getOnHandStock(wid, pid);
          if ($(badgeId)) $(badgeId).style.display = 'block';
          if ($(currentQtyId)) {
            $(currentQtyId).textContent = `${onHand} units`;
            $(currentQtyId).style.color = onHand === 0 ? 'var(--danger-text)' : 'var(--text-main)';
          }

          if (qty > 0) {
            if ($(previewId)) $(previewId).style.display = 'block';
            if (qty > onHand) {
              if ($(projId)) {
                $(projId).textContent = `Insufficient stock! (Max ${onHand})`;
                $(projId).style.color = 'var(--danger-text)';
              }
              if ($(btnSubmit)) $(btnSubmit).disabled = true;
            } else {
              if ($(projId)) {
                $(projId).textContent = `${onHand - qty} units (-${qty})`;
                $(projId).style.color = 'var(--success-text)';
              }
              if ($(btnSubmit)) $(btnSubmit).disabled = false;
            }
          } else {
            if ($(previewId)) $(previewId).style.display = 'none';
            if ($(btnSubmit)) $(btnSubmit).disabled = false;
          }
        } else {
          if ($(badgeId)) $(badgeId).style.display = 'none';
          if ($(previewId)) $(previewId).style.display = 'none';
        }
      };

      $(whId)?.addEventListener('change', update);
      $(prodId)?.addEventListener('change', update);
      $(qtyId)?.addEventListener('input', update);
    };

    bindStockOutLiveCalc(
      '#console-out-warehouse', '#console-out-product', '#console-out-qty',
      '#console-out-stock-badge', '#console-out-current-qty', '#console-out-preview', '#console-out-projected',
      $('#form-console-stock-out button[type="submit"]')
    );
    bindStockOutLiveCalc(
      '#modal-out-warehouse', '#modal-out-product', '#modal-out-qty',
      '#modal-out-stock-badge', '#modal-out-current-qty', '#modal-out-preview', '#modal-out-projected',
      $('#form-stock-out button[type="submit"]')
    );

    // ----------------------------------------------------
    // Transfer: Exclude Source from Dest & Live Validation
    // ----------------------------------------------------
    $('#console-tr-from-wh')?.addEventListener('change', () => {
      updateTransferDestOptions('console');
      updateTransferLiveStock('console');
    });
    $('#console-tr-product')?.addEventListener('change', () => updateTransferLiveStock('console'));
    $('#console-tr-qty')?.addEventListener('input', () => updateTransferLiveStock('console'));

    $('#modal-tr-from-wh')?.addEventListener('change', () => {
      updateTransferDestOptions('modal');
      updateTransferLiveStock('modal');
    });
    $('#modal-tr-product')?.addEventListener('change', () => updateTransferLiveStock('modal'));
    $('#modal-tr-qty')?.addEventListener('input', () => updateTransferLiveStock('modal'));

    function updateTransferLiveStock(prefix) {
      const srcWid = $(`#${prefix}-tr-from-wh`)?.value;
      const pid = $(`#${prefix}-tr-product`)?.value;
      const qty = parseInt($(`#${prefix}-tr-qty`)?.value) || 0;
      const badge = $(`#${prefix}-tr-stock-badge`);
      const currentQtyEl = $(`#${prefix}-tr-current-qty`);

      if (srcWid && pid) {
        const onHand = getOnHandStock(srcWid, pid);
        if (badge) badge.style.display = 'block';
        if (currentQtyEl) {
          currentQtyEl.textContent = `${onHand} units available`;
          currentQtyEl.style.color = onHand < qty ? 'var(--danger-text)' : 'var(--text-main)';
        }
      } else {
        if (badge) badge.style.display = 'none';
      }
    }

    // ----------------------------------------------------
    // Stock IN Submission (Console & Modal)
    // ----------------------------------------------------
    const handleStockInSubmit = async (wid, pid, qty, note, modalId) => {
      if (!wid || !pid || !qty) {
        showToast('Input Required', 'Please select warehouse, product, and quantity', 'warning');
        return;
      }
      try {
        const res = await window.API.stockIn({
          warehouse_id: parseInt(wid),
          product_id: parseInt(pid),
          quantity: parseInt(qty),
          note: note || 'Stock IN'
        });
        if (modalId) closeModal(modalId);
        showToast('Stock Added', `Inventory updated! Current on-hand: ${res.quantity} units`, 'success');
        await Promise.all([loadStock(), loadMovements()]);
        renderStockTable();
        renderDashboard();
        populateAllDropdowns();
      } catch (err) {
        showToast('Stock IN Error', err.message, 'error');
      }
    };

    $('#form-console-stock-in')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleStockInSubmit(
        $('#console-in-warehouse').value,
        $('#console-in-product').value,
        $('#console-in-qty').value,
        $('#console-in-note').value
      );
      $('#form-console-stock-in').reset();
    });

    $('#form-stock-in')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleStockInSubmit(
        $('#modal-in-warehouse').value,
        $('#modal-in-product').value,
        $('#modal-in-qty').value,
        $('#modal-in-note').value,
        '#modal-stock-in'
      );
    });

    // ----------------------------------------------------
    // Stock OUT Submission (Console & Modal)
    // ----------------------------------------------------
    const handleStockOutSubmit = async (wid, pid, qty, note, modalId) => {
      if (!wid || !pid || !qty) {
        showToast('Input Required', 'Please select warehouse, product, and quantity', 'warning');
        return;
      }
      try {
        const res = await window.API.stockOut({
          warehouse_id: parseInt(wid),
          product_id: parseInt(pid),
          quantity: parseInt(qty),
          note: note || 'Stock OUT'
        });
        if (modalId) closeModal(modalId);
        showToast('Stock Deducted', `Inventory deducted! Remaining on-hand: ${res.quantity} units`, 'success');
        await Promise.all([loadStock(), loadMovements()]);
        renderStockTable();
        renderDashboard();
        populateAllDropdowns();
      } catch (err) {
        showToast('Stock OUT Error', err.message, 'error');
      }
    };

    $('#form-console-stock-out')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleStockOutSubmit(
        $('#console-out-warehouse').value,
        $('#console-out-product').value,
        $('#console-out-qty').value,
        $('#console-out-note').value
      );
      $('#form-console-stock-out').reset();
    });

    $('#form-stock-out')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleStockOutSubmit(
        $('#modal-out-warehouse').value,
        $('#modal-out-product').value,
        $('#modal-out-qty').value,
        $('#modal-out-note').value,
        '#modal-stock-out'
      );
    });

    // ----------------------------------------------------
    // Transfer Submission (Console & Modal)
    // ----------------------------------------------------
    const handleTransferSubmit = async (srcWid, dstWid, pid, qty, note, modalId) => {
      if (!srcWid || !dstWid || !pid || !qty) {
        showToast('Input Required', 'Please select source, destination, product, and quantity', 'warning');
        return;
      }
      if (srcWid === dstWid) {
        showToast('Invalid Transfer', 'Source and destination warehouses cannot be the same', 'warning');
        return;
      }
      try {
        const res = await window.API.transfer({
          from_warehouse_id: parseInt(srcWid),
          to_warehouse_id: parseInt(dstWid),
          product_id: parseInt(pid),
          quantity: parseInt(qty),
          note: note || 'Warehouse Transfer'
        });
        if (modalId) closeModal(modalId);
        showToast('Transfer Complete', `Atomic relocation complete! Source: ${res.source_quantity}, Destination: ${res.destination_quantity}`, 'success');
        await Promise.all([loadStock(), loadMovements()]);
        renderStockTable();
        renderDashboard();
        populateAllDropdowns();
      } catch (err) {
        showToast('Transfer Error', err.message, 'error');
      }
    };

    $('#form-console-transfer')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleTransferSubmit(
        $('#console-tr-from-wh').value,
        $('#console-tr-to-wh').value,
        $('#console-tr-product').value,
        $('#console-tr-qty').value,
        $('#console-tr-note').value
      );
      $('#form-console-transfer').reset();
    });

    $('#form-transfer')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleTransferSubmit(
        $('#modal-tr-from-wh').value,
        $('#modal-tr-to-wh').value,
        $('#modal-tr-product').value,
        $('#modal-tr-qty').value,
        $('#modal-tr-note').value,
        '#modal-transfer'
      );
    });

    // ----------------------------------------------------
    // Create Purchase Order Form Submit
    // ----------------------------------------------------
    $('#form-create-po')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sid = $('#modal-po-supplier').value;
      const wid = $('#modal-po-warehouse').value;
      const pid = $('#modal-po-product').value;
      const qty = $('#modal-po-qty').value;
      const price = $('#modal-po-price').value;

      if (!sid || !wid || !pid || !qty || price === '') {
        showToast('Incomplete Form', 'Please fill in all required fields for the purchase order', 'warning');
        return;
      }

      try {
        const newPO = await window.API.createPurchaseOrder({
          supplier_id: parseInt(sid),
          warehouse_id: parseInt(wid),
          product_id: parseInt(pid),
          quantity: parseInt(qty),
          unit_price: parseFloat(price)
        });
        closeModal('#modal-create-po');
        showToast('Purchase Order Created', `Order #PO-${newPO.id} successfully created. Status: Created.`, 'success');
        await loadPurchaseOrders();
        renderPurchaseOrders();
        renderDashboard();
      } catch (err) {
        showToast('PO Creation Error', err.message || 'Failed to create purchase order', 'error');
      }
    });

    // Live PO Price Autocalculation
    const updatePOTotal = () => {
      const qty = parseInt($('#modal-po-qty')?.value) || 0;
      const price = parseFloat($('#modal-po-price')?.value) || 0;
      const totalEl = $('#modal-po-total-display');
      if (totalEl) totalEl.textContent = formatCurrency(qty * price);
    };
    $('#modal-po-qty')?.addEventListener('input', updatePOTotal);
    $('#modal-po-price')?.addEventListener('input', updatePOTotal);
    $('#modal-po-product')?.addEventListener('change', (e) => {
      const opt = e.target.selectedOptions[0];
      if (opt && opt.dataset.price) {
        $('#modal-po-price').value = opt.dataset.price;
        updatePOTotal();
      }
    });

    // ----------------------------------------------------
    // Add/Edit Product Form
    // ----------------------------------------------------
    $('#form-product')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = $('#modal-product-id').value;
      const sku = $('#modal-product-sku').value.trim().toUpperCase();
      const name = $('#modal-product-name').value.trim();
      const catId = $('#modal-product-category').value;
      const price = $('#modal-product-price').value;
      const minStock = $('#modal-product-min-stock').value;

      try {
        if (editId) {
          await window.API.updateProduct(editId, {
            sku, name,
            category_id: catId ? parseInt(catId) : null,
            price: parseFloat(price),
            min_stock: minStock !== '' ? parseInt(minStock) : 0
          });
          showToast('Product Updated', `Updated SKU: ${sku}`, 'success');
        } else {
          await window.API.createProduct({
            sku, name,
            category_id: catId ? parseInt(catId) : null,
            price: parseFloat(price),
            min_stock: minStock !== '' ? parseInt(minStock) : 0
          });
          showToast('Product Created', `Added master SKU: ${sku}`, 'success');
        }
        closeModal('#modal-product');
        await loadProducts();
        renderProductsTable();
        populateAllDropdowns();
      } catch (err) {
        showToast('Product Error', err.message, 'error');
      }
    });

    // ----------------------------------------------------
    // User Role Dynamic Fields in Add User Modal
    // ----------------------------------------------------
    const userRoleSel = $('#modal-user-role');
    const whWrap = $('#modal-user-warehouse-wrap');
    const supWrap = $('#modal-user-supplier-wrap');

    const updateUserModalFields = () => {
      const role = userRoleSel?.value;
      if (role === 'admin') {
        if (whWrap) whWrap.style.display = 'none';
        if (supWrap) supWrap.style.display = 'none';
        $('#modal-user-warehouse').required = false;
        $('#modal-user-supplier').required = false;
      } else if (role === 'manager' || role === 'staff') {
        if (whWrap) whWrap.style.display = 'block';
        if (supWrap) supWrap.style.display = 'none';
        $('#modal-user-warehouse').required = true;
        $('#modal-user-supplier').required = false;
      } else if (role === 'supplier') {
        if (whWrap) whWrap.style.display = 'none';
        if (supWrap) supWrap.style.display = 'block';
        $('#modal-user-warehouse').required = false;
        $('#modal-user-supplier').required = true;
      }
    };
    userRoleSel?.addEventListener('change', updateUserModalFields);
    updateUserModalFields();

    $('#form-user')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#modal-user-name').value.trim();
      const email = $('#modal-user-email').value.trim().toLowerCase();
      const password = $('#modal-user-password').value;
      const role = $('#modal-user-role').value;
      const warehouseId = $('#modal-user-warehouse').value || null;
      const supplierId = $('#modal-user-supplier').value || null;

      try {
        await window.API.createUser({
          name, email, password, role,
          warehouse_id: warehouseId ? parseInt(warehouseId) : null,
          supplier_id: supplierId ? parseInt(supplierId) : null
        });
        closeModal('#modal-user');
        showToast('User Account Created', `Created account for ${name} (${role})`, 'success');
        await loadUsers();
        renderUsersTable();
      } catch (err) {
        showToast('User Creation Error', err.message, 'error');
      }
    });

    // Login Form
    $('#form-login')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#login-email').value;
      const password = $('#login-password').value;
      try {
        await window.API.login(email, password);
        closeModal('#modal-login');
        renderAuthUI();
        showToast('Authenticated', 'Logged in successfully.', 'success');
        await ensureMasterDataLoaded();
        switchView(state.currentUser && state.currentUser.role === 'supplier' ? 'purchase-orders' : 'dashboard');
      } catch (err) {
        showToast('Login Error', err.message || 'Authentication failed', 'error');
      }
    });
  }

  // Filter Listeners
  function initFilters() {
    $('#search-stock')?.addEventListener('input', (e) => {
      state.filters.stockSearch = e.target.value;
      renderStockTable();
    });

    $('#filter-stock-warehouse')?.addEventListener('change', async (e) => {
      state.filters.stockWarehouse = e.target.value;
      await loadStock();
      renderStockTable();
    });

    $('#filter-low-stock-toggle')?.addEventListener('click', () => {
      state.filters.stockLowOnly = !state.filters.stockLowOnly;
      $('#filter-low-stock-toggle').classList.toggle('active', state.filters.stockLowOnly);
      renderStockTable();
    });

    $$('.po-filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        $$('.po-filter-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        state.filters.poStatus = btn.getAttribute('data-status');
        await loadPurchaseOrders();
        renderPurchaseOrders();
      });
    });

    $('#filter-movement-type')?.addEventListener('change', async (e) => {
      state.filters.movementType = e.target.value;
      await loadMovements();
      renderMovementsTable();
    });
  }

  // Global Actions Hub
  window.NEXUS = {
    openLoginModal: () => openModal('#modal-login'),
    closeLoginModal: () => closeModal('#modal-login'),

    openQuickStockIn: async (productId, warehouseId) => {
      await ensureMasterDataLoaded();
      openModal('#modal-stock-in');
      const selWh = $('#modal-in-warehouse');
      const selProd = $('#modal-in-product');
      if (selWh && warehouseId) selWh.value = warehouseId;
      if (selProd && productId) selProd.value = productId;
      selWh?.dispatchEvent(new Event('change'));
    },

    openQuickStockOut: async (productId, warehouseId) => {
      await ensureMasterDataLoaded();
      openModal('#modal-stock-out');
      const selWh = $('#modal-out-warehouse');
      const selProd = $('#modal-out-product');
      if (selWh && warehouseId) selWh.value = warehouseId;
      if (selProd && productId) selProd.value = productId;
      selWh?.dispatchEvent(new Event('change'));
    },

    openQuickTransfer: async (productId, warehouseId) => {
      await ensureMasterDataLoaded();
      openModal('#modal-transfer');
      const selFrom = $('#modal-tr-from-wh');
      const selProd = $('#modal-tr-product');
      if (selFrom && warehouseId) selFrom.value = warehouseId;
      if (selProd && productId) selProd.value = productId;
      updateTransferDestOptions('modal');
      selFrom?.dispatchEvent(new Event('change'));
    },

    openNewPOModal: async () => {
      await ensureMasterDataLoaded();
      openModal('#modal-create-po');

      const user = state.currentUser;
      const role = user ? user.role : 'guest';
      const selWh = $('#modal-po-warehouse');

      if (selWh) {
        if (role === 'manager') {
          selWh.value = user.warehouse_id;
          selWh.disabled = true;
        } else {
          selWh.disabled = false;
        }
      }

      // Pre-select first product price if selected
      const prodSel = $('#modal-po-product');
      if (prodSel && prodSel.value) {
        prodSel.dispatchEvent(new Event('change'));
      }
    },

    dispatchPO: async (id) => {
      const po = state.purchaseOrders.find(o => o.id === parseInt(id));
      const label = po ? `PO #PO-${id} (${po.product_name} x ${po.quantity})` : `PO #PO-${id}`;
      if (!confirm(`Accept and dispatch ${label} for delivery to warehouse?`)) return;

      try {
        await window.API.dispatchPurchaseOrder(id);
        showToast('Order Accepted & Dispatched', `${label} has been accepted and is now in 'Dispatched' transit.`, 'success');
        await loadPurchaseOrders();
        renderPurchaseOrders();
        if (state.currentView === 'dashboard') renderSupplierDashboard();
      } catch (err) {
        showToast('Dispatch Failed', err.message || 'Could not dispatch purchase order', 'error');
      }
    },

    receivePO: async (id) => {
      const po = state.purchaseOrders.find(o => o.id === parseInt(id));
      const label = po ? `PO #PO-${id} (${po.product_name} x ${po.quantity})` : `PO #PO-${id}`;
      if (!confirm(`Confirm receipt for ${label}?\n\nThis will automatically increment ${po ? po.warehouse_name : 'warehouse'} inventory and log an audit movement.`)) return;

      try {
        await window.API.receivePurchaseOrder(id);
        showToast('Goods Received', `${label} received! Inventory updated successfully.`, 'success');
        await Promise.all([loadPurchaseOrders(), loadStock(), loadMovements()]);
        renderPurchaseOrders();
        renderStockTable();
        renderDashboard();
      } catch (err) {
        showToast('Receive Failed', err.message || 'Could not receive purchase order', 'error');
      }
    },

    cancelPO: async (id) => {
      if (!confirm(`Are you sure you want to cancel Purchase Order #PO-${id}? This action is terminal and cannot be undone.`)) return;
      try {
        await window.API.cancelPurchaseOrder(id);
        showToast('Order Cancelled', `PO #PO-${id} has been cancelled.`, 'warning');
        await loadPurchaseOrders();
        renderPurchaseOrders();
      } catch (err) {
        showToast('Cancellation Failed', err.message || 'Could not cancel order', 'error');
      }
    },

    openNewProductModal: () => {
      $('#modal-product-id').value = '';
      $('#modal-product-title').textContent = 'Add Master Product SKU';
      $('#form-product').reset();
      populateAllDropdowns();
      openModal('#modal-product');
    },

    openEditProduct: (id) => {
      const p = state.products.find(x => x.id === id);
      if (!p) return;
      populateAllDropdowns();
      $('#modal-product-id').value = p.id;
      $('#modal-product-title').textContent = `Edit Master SKU: ${p.sku}`;
      $('#modal-product-sku').value = p.sku;
      $('#modal-product-name').value = p.name;
      $('#modal-product-price').value = p.price;
      $('#modal-product-min-stock').value = p.min_stock;
      if ($('#modal-product-category')) $('#modal-product-category').value = p.category_id || '';
      openModal('#modal-product');
    },

    deleteProduct: async (id) => {
      if (!confirm('Are you sure you want to deactivate this product SKU?')) return;
      try {
        await window.API.deleteProduct(id);
        showToast('Deactivated', 'Product SKU deactivated.', 'info');
        await loadProducts();
        renderProductsTable();
        populateAllDropdowns();
      } catch (err) {
        showToast('Error', err.message, 'error');
      }
    },

    reactivateProduct: async (id) => {
      try {
        await window.API.updateProduct(id, { is_active: true });
        showToast('Reactivated', 'Product SKU reactivated.', 'success');
        await loadProducts();
        renderProductsTable();
        populateAllDropdowns();
      } catch (err) {
        showToast('Error', err.message, 'error');
      }
    },

    openNewUserModal: () => {
      $('#form-user').reset();
      populateAllDropdowns();
      openModal('#modal-user');
    },

    deleteUser: async (id) => {
      if (!confirm('Are you sure you want to deactivate this user account?')) return;
      try {
        await window.API.deleteUser(id);
        showToast('Deactivated', 'User account deactivated.', 'info');
        await loadUsers();
        renderUsersTable();
      } catch (err) {
        showToast('Error', err.message, 'error');
      }
    }
  };

  // Initialization
  async function init() {
    initTheme();
    initNavigation();
    initModalsAndConsoles();
    initFilters();

    await checkBackendStatus();

    // Default Demo Login as Admin
    if (!window.API.getUser()) {
      await quickLogin('admin');
    } else {
      renderAuthUI();
      await ensureMasterDataLoaded();
      switchView('dashboard');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
