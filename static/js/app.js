/**
 * NEXUS WMS — Main Application Controller (Vanilla JS)
 * Handles role-based views, live tables, modals, transactions,
 * search/filters, toasts, and UI interactions.
 */

(function () {
  'use strict';

  // State
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

  // Helper: DOM selectors
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Helper: Format Currency
  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper: Format Date
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
    }, 4000);
  }

  // HTML sanitizer
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  // Check Backend Live Status
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
        dot.title = 'Offline mode: local demo mock storage active';
      }
      if (label) label.textContent = 'Demo Mode (Offline)';
    }
  }

  // Navigation & View Routing
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

    // Role switcher dropdown in header
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

  function switchView(viewName) {
    state.currentView = viewName;

    // Update active nav link
    $$('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-view') === viewName);
    });

    // Update active section
    $$('.view-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `view-${viewName}`);
    });

    // Update Topbar Title
    const titles = {
      dashboard: { title: 'Operations Dashboard', sub: 'Real-time warehouse KPIs and operational overview' },
      stock: { title: 'Stock Inventory', sub: 'Current product quantities across warehouses' },
      operations: { title: 'Stock Operations', sub: 'Receive stock IN, dispatch OUT, or transfer between warehouses' },
      movements: { title: 'Stock Movement Audit Log', sub: 'Immutable audit trail of all inventory events' },
      'purchase-orders': { title: 'Purchase Orders', sub: 'Supplier procurement lifecycle & goods receiving' },
      products: { title: 'Product Catalog', sub: 'Manage master SKUs, pricing, and safety stock thresholds' },
      warehouses: { title: 'Warehouses', sub: 'Storage hubs and godown facilities' },
      suppliers: { title: 'Suppliers', sub: 'Authorized product vendors and trade contacts' },
      users: { title: 'User Management', sub: 'System accounts, assigned warehouses, and role permissions' }
    };

    const info = titles[viewName] || { title: 'Warehouse Management', sub: '' };
    const pageTitle = $('#page-title');
    const pageSub = $('#page-subtitle');
    if (pageTitle) pageTitle.textContent = info.title;
    if (pageSub) pageSub.textContent = info.sub;

    // Close mobile sidebar if open
    const sidebar = $('#sidebar');
    if (sidebar) sidebar.classList.remove('open');

    // Trigger data refresh for active view
    loadViewData(viewName);
  }

  // Load Data for Views
  async function loadViewData(viewName) {
    try {
      switch (viewName) {
        case 'dashboard':
          await Promise.all([loadStock(), loadPurchaseOrders(), loadMovements()]);
          renderDashboard();
          break;
        case 'stock':
          await loadStock();
          renderStockTable();
          break;
        case 'operations':
          await Promise.all([loadStock(), loadProducts(), loadWarehouses()]);
          populateOperationDropdowns();
          break;
        case 'movements':
          await loadMovements();
          renderMovementsTable();
          break;
        case 'purchase-orders':
          await Promise.all([loadPurchaseOrders(), loadSuppliers(), loadWarehouses(), loadProducts()]);
          renderPurchaseOrders();
          break;
        case 'products':
          await Promise.all([loadProducts(), loadCategories()]);
          renderProductsTable();
          break;
        case 'warehouses':
          await loadWarehouses();
          renderWarehousesGrid();
          break;
        case 'suppliers':
          await loadSuppliers();
          renderSuppliersGrid();
          break;
        case 'users':
          await Promise.all([loadUsers(), loadWarehouses(), loadSuppliers()]);
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
          const wh = user.warehouse_name ? ` (${user.warehouse_name})` : (user.supplier_name ? ` (${user.supplier_name})` : '');
          roleEl.textContent = `${user.role.toUpperCase()}${wh}`;
        }
        if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
      }
      if (loginBtn) loginBtn.style.display = 'none';

      // Sync role dropdown
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
    // Admin: all links
    // Manager: Dashboard, Stock, Operations, Movements, POs, Warehouses, Suppliers
    // Staff: Dashboard, Stock, Operations, Movements
    // Supplier: Dashboard, Purchase Orders only
    // Guest: only Dashboard
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

    // Sections visibility titles in sidebar
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
            txt.innerHTML = `<strong>Role Scope:</strong> Operating under <strong>${escapeHtml(user.warehouse_name || 'Assigned Warehouse')}</strong> (#${user.warehouse_id}). Inventory and order actions are scoped to this facility.`;
          } else if (role === 'supplier') {
            txt.innerHTML = `<strong>Supplier Portal:</strong> Linked to <strong>${escapeHtml(user.supplier_name || 'Supplier Account')}</strong> (#${user.supplier_id}). You can review and dispatch purchase orders assigned to your company.`;
          }
        }
      } else {
        banner.style.display = 'none';
      }
    }
  }

  // Quick Login helper
  async function quickLogin(accountKey) {
    const acc = window.DEMO_ACCOUNTS[accountKey];
    if (!acc) return;
    try {
      showToast('Authenticating...', `Logging in as ${acc.label}`, 'info');
      await window.API.login(acc.email, acc.password);
      renderAuthUI();
      showToast('Welcome!', `Logged in as ${acc.label}`, 'success');
      switchView(state.currentView);
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

    // Render Low Stock Alert Table in Dashboard
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

    // Render Recent Movements in Dashboard
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

  // 2. Stock Table View
  function renderStockTable() {
    const tbody = $('#stock-table-tbody');
    if (!tbody) return;

    // Apply client filters: search & low stock toggle
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

    // Update counter
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

      // Visual progress bar percentage (0 to 100% relative to min_stock * 2)
      const maxExpected = Math.max(item.min_stock * 2.5, 20);
      const fillPct = Math.min(100, Math.round((item.quantity / maxExpected) * 100));
      const fillClass = isOut ? 'danger' : (isLow ? 'warning' : '');

      return `
        <tr class="${isLow ? 'row-alert' : ''}">
          <td><span class="badge-sku">${escapeHtml(item.sku)}</span></td>
          <td>
            <strong>${escapeHtml(item.product_name)}</strong>
          </td>
          <td>${escapeHtml(item.warehouse_name)}</td>
          <td class="tabular">
            <strong>${item.quantity}</strong>
          </td>
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

  // 3. Stock Operations Panel & Forms
  function populateOperationDropdowns() {
    const user = state.currentUser;
    const isRestrictedWh = user && (user.role === 'manager' || user.role === 'staff');

    // Fill Warehouses
    const populateWhSelect = (selId, allowAll = false) => {
      const sel = $(selId);
      if (!sel) return;
      sel.innerHTML = allowAll ? '<option value="">All Warehouses</option>' : '<option value="">Select Warehouse...</option>';
      state.warehouses.forEach(w => {
        if (!w.is_active) return;
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = `${w.name} (${w.location})`;
        if (isRestrictedWh && w.id === user.warehouse_id) {
          opt.selected = true;
        }
        sel.appendChild(opt);
      });
      if (isRestrictedWh && !allowAll) {
        sel.value = user.warehouse_id;
        sel.disabled = true;
      }
    };

    populateWhSelect('#op-in-warehouse');
    populateWhSelect('#op-out-warehouse');
    populateWhSelect('#op-tr-from-wh');
    populateWhSelect('#op-tr-to-wh');
    populateWhSelect('#filter-stock-warehouse', true);

    // Fill Products
    const populateProdSelect = (selId) => {
      const sel = $(selId);
      if (!sel) return;
      sel.innerHTML = '<option value="">Select Product...</option>';
      state.products.forEach(p => {
        if (!p.is_active) return;
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `[${p.sku}] ${p.name} - ₹${p.price}`;
        sel.appendChild(opt);
      });
    };

    populateProdSelect('#op-in-product');
    populateProdSelect('#op-out-product');
    populateProdSelect('#op-tr-product');
  }

  // 4. Stock Movements Audit Table
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

  // 5. Purchase Orders View
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

      // Action buttons based on role and status
      let actionButtons = '';
      if (role === 'supplier' && po.status === 'Created') {
        actionButtons = `
          <button class="btn btn-primary btn-sm" onclick="window.NEXUS.dispatchPO(${po.id})">
            Dispatch Order
          </button>
        `;
      } else if (['admin', 'manager'].includes(role)) {
        if (po.status === 'Dispatched') {
          actionButtons = `
            <button class="btn btn-success btn-sm" onclick="window.NEXUS.receivePO(${po.id})">
              Receive Goods
            </button>
          `;
        }
        if (['Created', 'Dispatched'].includes(po.status)) {
          actionButtons += `
            <button class="btn btn-danger btn-sm" style="margin-left: 0.35rem;" onclick="window.NEXUS.cancelPO(${po.id})">
              Cancel
            </button>
          `;
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
          <td class="tabular">${po.quantity}</td>
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

  // 6. Products Master Catalog
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

  // 7. Warehouses Grid
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

  // 8. Suppliers Grid
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

  // 9. Users Table
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
  // MODALS & ACTIONS
  // ==========================================

  function openModal(modalId) {
    const modal = $(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = $(modalId);
    if (modal) modal.classList.remove('active');
  }

  function initModals() {
    // Backdrop click and close buttons
    $$('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
      const closeBtn = modal.querySelector('.modal-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
      }
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
      }
    });

    // Login Form Submit
    const loginForm = $('#form-login');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#login-email').value;
        const password = $('#login-password').value;
        try {
          await window.API.login(email, password);
          closeModal('#modal-login');
          renderAuthUI();
          showToast('Authenticated', 'Logged in successfully.', 'success');
          loadViewData(state.currentView);
        } catch (err) {
          showToast('Login Error', err.message || 'Authentication failed', 'error');
        }
      });
    }

    // Stock IN Form Submit
    const stockInForm = $('#form-stock-in');
    if (stockInForm) {
      stockInForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const wid = $('#modal-in-warehouse').value;
        const pid = $('#modal-in-product').value;
        const qty = $('#modal-in-qty').value;
        const note = $('#modal-in-note').value;

        try {
          const res = await window.API.stockIn({
            warehouse_id: wid,
            product_id: pid,
            quantity: qty,
            note: note
          });
          closeModal('#modal-stock-in');
          showToast('Stock Added', `New stock quantity: ${res.quantity} units`, 'success');
          loadViewData(state.currentView);
        } catch (err) {
          showToast('Stock IN Error', err.message, 'error');
        }
      });
    }

    // Stock OUT Form Submit
    const stockOutForm = $('#form-stock-out');
    if (stockOutForm) {
      stockOutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const wid = $('#modal-out-warehouse').value;
        const pid = $('#modal-out-product').value;
        const qty = $('#modal-out-qty').value;
        const note = $('#modal-out-note').value;

        try {
          const res = await window.API.stockOut({
            warehouse_id: wid,
            product_id: pid,
            quantity: qty,
            note: note
          });
          closeModal('#modal-stock-out');
          showToast('Stock Deducted', `Remaining stock: ${res.quantity} units`, 'success');
          loadViewData(state.currentView);
        } catch (err) {
          showToast('Stock OUT Error', err.message, 'error');
        }
      });
    }

    // Transfer Form Submit
    const transferForm = $('#form-transfer');
    if (transferForm) {
      transferForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const srcWid = $('#modal-tr-from-wh').value;
        const dstWid = $('#modal-tr-to-wh').value;
        const pid = $('#modal-tr-product').value;
        const qty = $('#modal-tr-qty').value;
        const note = $('#modal-tr-note').value;

        try {
          const res = await window.API.transfer({
            from_warehouse_id: srcWid,
            to_warehouse_id: dstWid,
            product_id: pid,
            quantity: qty,
            note: note
          });
          closeModal('#modal-transfer');
          showToast('Transfer Complete', `Moved ${qty} units. Source: ${res.source_quantity}, Dest: ${res.destination_quantity}`, 'success');
          loadViewData(state.currentView);
        } catch (err) {
          showToast('Transfer Error', err.message, 'error');
        }
      });
    }

    // Create PO Form Submit
    const poForm = $('#form-create-po');
    if (poForm) {
      poForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sid = $('#modal-po-supplier').value;
        const wid = $('#modal-po-warehouse').value;
        const pid = $('#modal-po-product').value;
        const qty = $('#modal-po-qty').value;
        const price = $('#modal-po-price').value;

        try {
          await window.API.createPurchaseOrder({
            supplier_id: sid,
            warehouse_id: wid,
            product_id: pid,
            quantity: qty,
            unit_price: price
          });
          closeModal('#modal-create-po');
          showToast('Purchase Order Created', 'New order is in "Created" status ready for supplier dispatch.', 'success');
          loadViewData(state.currentView);
        } catch (err) {
          showToast('PO Error', err.message, 'error');
        }
      });
    }

    // Product Add/Edit Form
    const productForm = $('#form-product');
    if (productForm) {
      productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = $('#modal-product-id').value;
        const sku = $('#modal-product-sku').value;
        const name = $('#modal-product-name').value;
        const catId = $('#modal-product-category').value;
        const price = $('#modal-product-price').value;
        const minStock = $('#modal-product-min-stock').value;

        try {
          if (editId) {
            await window.API.updateProduct(editId, {
              sku, name, category_id: catId, price, min_stock: minStock
            });
            showToast('Product Updated', `Updated ${name}`, 'success');
          } else {
            await window.API.createProduct({
              sku, name, category_id: catId, price, min_stock: minStock
            });
            showToast('Product Created', `Added ${name}`, 'success');
          }
          closeModal('#modal-product');
          loadViewData(state.currentView);
        } catch (err) {
          showToast('Product Error', err.message, 'error');
        }
      });
    }

    // User Add Form
    const userForm = $('#form-user');
    if (userForm) {
      userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('#modal-user-name').value;
        const email = $('#modal-user-email').value;
        const password = $('#modal-user-password').value;
        const role = $('#modal-user-role').value;
        const warehouseId = $('#modal-user-warehouse').value || null;
        const supplierId = $('#modal-user-supplier').value || null;

        try {
          await window.API.createUser({
            name, email, password, role,
            warehouse_id: warehouseId,
            supplier_id: supplierId
          });
          closeModal('#modal-user');
          showToast('User Created', `Added account for ${name}`, 'success');
          loadViewData(state.currentView);
        } catch (err) {
          showToast('User Error', err.message, 'error');
        }
      });
    }
  }

  // Filter Listeners
  function initFilters() {
    // Stock search input
    const stockSearch = $('#search-stock');
    if (stockSearch) {
      stockSearch.addEventListener('input', (e) => {
        state.filters.stockSearch = e.target.value;
        renderStockTable();
      });
    }

    // Stock warehouse select filter
    const stockWh = $('#filter-stock-warehouse');
    if (stockWh) {
      stockWh.addEventListener('change', async (e) => {
        state.filters.stockWarehouse = e.target.value;
        await loadStock();
        renderStockTable();
      });
    }

    // Low stock filter chip toggle
    const lowStockToggle = $('#filter-low-stock-toggle');
    if (lowStockToggle) {
      lowStockToggle.addEventListener('click', () => {
        state.filters.stockLowOnly = !state.filters.stockLowOnly;
        lowStockToggle.classList.toggle('active', state.filters.stockLowOnly);
        renderStockTable();
      });
    }

    // PO status tabs
    $$('.po-filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        $$('.po-filter-btn').forEach(b => b.classList.remove('btn-primary'));
        btn.classList.add('btn-primary');
        state.filters.poStatus = btn.getAttribute('data-status');
        await loadPurchaseOrders();
        renderPurchaseOrders();
      });
    });

    // Movement type filter
    const movType = $('#filter-movement-type');
    if (movType) {
      movType.addEventListener('change', async (e) => {
        state.filters.movementType = e.target.value;
        await loadMovements();
        renderMovementsTable();
      });
    }
  }

  // Exposed Global Actions for inline button clicks
  window.NEXUS = {
    openLoginModal: () => openModal('#modal-login'),
    closeLoginModal: () => closeModal('#modal-login'),

    openQuickStockIn: (productId, warehouseId) => {
      openModal('#modal-stock-in');
      const selWh = $('#modal-in-warehouse');
      const selProd = $('#modal-in-product');
      if (selWh) selWh.value = warehouseId;
      if (selProd) selProd.value = productId;
    },

    openQuickStockOut: (productId, warehouseId) => {
      openModal('#modal-stock-out');
      const selWh = $('#modal-out-warehouse');
      const selProd = $('#modal-out-product');
      if (selWh) selWh.value = warehouseId;
      if (selProd) selProd.value = productId;
    },

    openQuickTransfer: (productId, warehouseId) => {
      openModal('#modal-transfer');
      const selFrom = $('#modal-tr-from-wh');
      const selProd = $('#modal-tr-product');
      if (selFrom) selFrom.value = warehouseId;
      if (selProd) selProd.value = productId;
    },

    openNewPOModal: () => {
      openModal('#modal-create-po');
      // Populate select dropdowns
      const selSup = $('#modal-po-supplier');
      const selWh = $('#modal-po-warehouse');
      const selProd = $('#modal-po-product');

      if (selSup) {
        selSup.innerHTML = '<option value="">Select Supplier...</option>' +
          state.suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
      }
      if (selWh) {
        selWh.innerHTML = '<option value="">Select Destination...</option>' +
          state.warehouses.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
        if (state.currentUser && state.currentUser.role === 'manager') {
          selWh.value = state.currentUser.warehouse_id;
          selWh.disabled = true;
        }
      }
      if (selProd) {
        selProd.innerHTML = '<option value="">Select Product...</option>' +
          state.products.map(p => `<option value="${p.id}" data-price="${p.price}">[${p.sku}] ${escapeHtml(p.name)}</option>`).join('');
        selProd.onchange = (e) => {
          const opt = selProd.selectedOptions[0];
          if (opt && opt.dataset.price) {
            $('#modal-po-price').value = opt.dataset.price;
          }
        };
      }
    },

    dispatchPO: async (id) => {
      if (!confirm(`Confirm dispatch for Purchase Order #PO-${id}?`)) return;
      try {
        await window.API.dispatchPurchaseOrder(id);
        showToast('Order Dispatched', `PO #${id} is now on route to warehouse facility.`, 'success');
        loadPurchaseOrders();
        renderPurchaseOrders();
      } catch (err) {
        showToast('Dispatch Failed', err.message, 'error');
      }
    },

    receivePO: async (id) => {
      if (!confirm(`Receive and stock in goods for Purchase Order #PO-${id}? Inventory will increase automatically.`)) return;
      try {
        await window.API.receivePurchaseOrder(id);
        showToast('Goods Received', `PO #${id} received and stock successfully logged.`, 'success');
        loadPurchaseOrders();
        renderPurchaseOrders();
      } catch (err) {
        showToast('Receive Failed', err.message, 'error');
      }
    },

    cancelPO: async (id) => {
      if (!confirm(`Are you sure you want to cancel Purchase Order #PO-${id}? This action cannot be undone.`)) return;
      try {
        await window.API.cancelPurchaseOrder(id);
        showToast('Order Cancelled', `PO #${id} has been cancelled.`, 'warning');
        loadPurchaseOrders();
        renderPurchaseOrders();
      } catch (err) {
        showToast('Cancellation Failed', err.message, 'error');
      }
    },

    openNewProductModal: () => {
      $('#modal-product-id').value = '';
      $('#modal-product-title').textContent = 'Add Master Product SKU';
      $('#form-product').reset();
      const selCat = $('#modal-product-category');
      if (selCat) {
        selCat.innerHTML = '<option value="">Select Category...</option>' +
          state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      }
      openModal('#modal-product');
    },

    openEditProduct: (id) => {
      const p = state.products.find(x => x.id === id);
      if (!p) return;
      $('#modal-product-id').value = p.id;
      $('#modal-product-title').textContent = `Edit Product [${p.sku}]`;
      $('#modal-product-sku').value = p.sku;
      $('#modal-product-name').value = p.name;
      $('#modal-product-price').value = p.price;
      $('#modal-product-min-stock').value = p.min_stock;
      const selCat = $('#modal-product-category');
      if (selCat) {
        selCat.innerHTML = '<option value="">Select Category...</option>' +
          state.categories.map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
      }
      openModal('#modal-product');
    },

    deleteProduct: async (id) => {
      if (!confirm('Are you sure you want to deactivate this product?')) return;
      try {
        await window.API.deleteProduct(id);
        showToast('Deactivated', 'Product deactivated.', 'info');
        loadProducts();
        renderProductsTable();
      } catch (err) {
        showToast('Error', err.message, 'error');
      }
    },

    reactivateProduct: async (id) => {
      try {
        await window.API.updateProduct(id, { is_active: true });
        showToast('Reactivated', 'Product reactivated successfully.', 'success');
        loadProducts();
        renderProductsTable();
      } catch (err) {
        showToast('Error', err.message, 'error');
      }
    },

    openNewUserModal: () => {
      $('#form-user').reset();
      const selWh = $('#modal-user-warehouse');
      const selSup = $('#modal-user-supplier');
      if (selWh) {
        selWh.innerHTML = '<option value="">Select Warehouse...</option>' +
          state.warehouses.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
      }
      if (selSup) {
        selSup.innerHTML = '<option value="">Select Supplier...</option>' +
          state.suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
      }
      openModal('#modal-user');
    },

    deleteUser: async (id) => {
      if (!confirm('Are you sure you want to deactivate this user account?')) return;
      try {
        await window.API.deleteUser(id);
        showToast('Deactivated', 'User deactivated.', 'info');
        loadUsers();
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
    initModals();
    initFilters();

    // Check server health
    await checkBackendStatus();

    // Auto-login as Admin by default for an immediate demo experience if not already logged in
    if (!window.API.getUser()) {
      await quickLogin('admin');
    } else {
      renderAuthUI();
    }

    // Load initial view
    switchView('dashboard');
  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
