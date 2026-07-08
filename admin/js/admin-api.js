/* ==========================================================================
   邻里鲜生 · 运营后台 API 客户端
   ========================================================================== */
const AdminAPI = (function () {
  const BASE = '/api/v1';

  function getToken() { return localStorage.getItem('admin_token') || localStorage.getItem('linli_token') || ''; }
  function setToken(t) { localStorage.setItem('admin_token', t); }

  function getAdminInfo() {
    const info = localStorage.getItem('admin_info');
    try { return info ? JSON.parse(info) : null; } catch (e) { return null; }
  }
  function setAdminInfo(info) { localStorage.setItem('admin_info', JSON.stringify(info)); }
  function clearAdmin() {
    localStorage.removeItem('admin_info');
    localStorage.removeItem('admin_token');
  }

  async function request(method, path, body) {
    const url = BASE + path;
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const opts = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const resp = await fetch(url, opts);
    const json = await resp.json();

    if (json.code !== 0) {
      throw new Error(json.message || '请求失败');
    }
    return json.data;
  }

  return {
    // Auth
    login: (phone, password) => request('POST', '/auth/login', { phone, password }),
    loginGuest: () => request('POST', '/auth/login-guest', {}),
    getToken, setToken,
    getAdminInfo, setAdminInfo, clearAdmin,

    // Dashboard
    getOverview: (dateRange) => request('GET', `/admin/reports/overview?dateRange=${dateRange || 'today'}`),

    // Products
    getProducts: (params) => {
      const q = new URLSearchParams(params).toString();
      return request('GET', `/admin/products?${q}`);
    },
    createProduct: (data) => request('POST', '/admin/products', data),
    updateProductStatus: (id, status) => request('PUT', `/admin/products/${id}/status`, { status }),

    // Orders
    getOrders: (params) => {
      const q = new URLSearchParams(params).toString();
      return request('GET', `/admin/orders?${q}`);
    },

    // Leaders
    getLeaders: (status) => request('GET', `/admin/leaders${status ? '?status=' + status : ''}`),
    updateLeaderStatus: (id, status) => request('PUT', `/admin/leaders/${id}/status`, { status }),

    // Coupons
    getCoupons: () => request('GET', '/admin/coupons'),
    createCoupon: (data) => request('POST', '/admin/coupons', data),

    // Riders
    getRiders: (params) => {
      const q = new URLSearchParams(params).toString();
      return request('GET', `/admin/riders?${q}`);
    },
    createRider: (data) => request('POST', '/admin/riders', data),
    updateRiderStatus: (id, status) => request('PUT', `/admin/riders/${id}/status`, { status }),

    // Inventory
    getInventory: (params) => {
      const q = new URLSearchParams(params).toString();
      return request('GET', `/admin/inventory?${q}`);
    },
    updateInventory: (id, data) => request('PUT', `/admin/inventory/${id}`, data),

    // Warehouses
    getWarehouses: () => request('GET', '/admin/warehouses'),

    // Admin login (public route, not behind authMiddleware)
    adminLogin: (username, password) => request('POST', '/auth/admin-login', { username, password }),

    // Banners
    getBanners: (status) => request('GET', `/admin/banners${status ? '?status=' + status : ''}`),
    createBanner: (data) => request('POST', '/admin/banners', data),
    updateBanner: (id, data) => request('PUT', `/admin/banners/${id}`, data),
    deleteBanner: (id) => request('DELETE', `/admin/banners/${id}`),
    updateBannerStatus: (id, status) => request('PUT', `/admin/banners/${id}/status`, { status }),

    // Member rules
    getMemberRules: () => request('GET', '/admin/member-rules'),
    updateMemberRule: (id, data) => request('PUT', `/admin/member-rules/${id}`, data),

    // Community SKU
    getCommunitySku: (communityId) => request('GET', `/admin/community-sku?communityId=${communityId}`),
    addCommunitySku: (data) => request('POST', '/admin/community-sku', data),
    deleteCommunitySku: (id) => request('DELETE', `/admin/community-sku/${id}`),
    batchAddCommunitySku: (data) => request('POST', '/admin/community-sku/batch', data),

    // Leader applications
    getLeaderApplications: (status) => request('GET', `/admin/leader-applications${status !== undefined && status !== '' ? '?status=' + status : ''}`),
    approveLeaderApp: (id, data) => request('PUT', `/admin/leader-applications/${id}/approve`, data),
    rejectLeaderApp: (id, data) => request('PUT', `/admin/leader-applications/${id}/reject`, data),

    // Finance
    getFinanceRecords: (type, page) => {
      const params = [];
      if (type) params.push('type=' + type);
      if (page) params.push('page=' + page);
      const qs = params.length ? '?' + params.join('&') : '';
      return request('GET', '/admin/finance/records' + qs);
    },
    getFinanceSummary: (dateRange) => request('GET', `/admin/finance/summary?dateRange=${dateRange}`),
    reconcileFinance: () => request('POST', '/admin/finance/reconcile'),

    // User reports
    getUserReports: () => request('GET', '/admin/reports/users'),

    // Operation logs
    getLogs: (page) => request('GET', `/admin/logs${page ? '?page=' + page : ''}`),

    // Product import/export
    exportProducts: () => request('GET', '/admin/products/export'),
    importProducts: (products) => request('POST', '/admin/products/import', { products }),

    // Rider performance
    getRiderPerformance: (id) => request('GET', `/admin/riders/${id}/performance`),

    // Order dispatch
    getDispatchOrders: () => request('GET', '/admin/orders/dispatch'),
    assignRider: (orderId, riderId) => request('POST', `/admin/orders/${orderId}/assign-rider`, { riderId }),
    adminCancelOrder: (orderId, reason) => request('POST', `/admin/orders/${orderId}/cancel`, { reason }),

    // RBAC
    getRoles: () => request('GET', '/admin/roles'),
    createRole: (data) => request('POST', '/admin/roles', data),
    updateRole: (id, data) => request('PUT', `/admin/roles/${id}`, data),
    getAdminUsers: () => request('GET', '/admin/admin-users'),
    createAdminUser: (data) => request('POST', '/admin/admin-users', data),
    updateAdminUser: (id, data) => request('PUT', `/admin/admin-users/${id}`, data),
    updateAdminUserStatus: (id, status) => request('PUT', `/admin/admin-users/${id}/status`, { status }),
    updateAdminUserPassword: (id, newPassword) => request('PUT', `/admin/admin-users/${id}/password`, { newPassword }),
    deleteAdminUser: (id) => request('DELETE', `/admin/admin-users/${id}`),

    // 前台用户管理
    getUsers: (params = {}) => {
      const q = new URLSearchParams();
      Object.keys(params).forEach(k => { if (params[k] !== undefined && params[k] !== '' && params[k] !== null) q.append(k, params[k]); });
      const qs = q.toString();
      return request('GET', '/admin/users' + (qs ? '?' + qs : ''));
    },
    getUserDetail: (id) => request('GET', `/admin/users/${id}`),
    updateUser: (id, data) => request('PUT', `/admin/users/${id}`, data),
    updateUserStatus: (id, status) => request('PUT', `/admin/users/${id}/status`, { status }),
    resetUserPassword: (id, newPassword) => request('POST', `/admin/users/${id}/reset-password`, { newPassword }),

    // Inventory warnings
    getInventoryWarnings: () => request('GET', '/admin/inventory/warnings'),

    // Communities
    getCommunities: () => request('GET', '/admin/communities'),
  };
})();
