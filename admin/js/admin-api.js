/* ==========================================================================
   邻里鲜生 · 运营后台 API 客户端
   ========================================================================== */
const AdminAPI = (function () {
  const BASE = '/api/v1';

  function getToken() { return localStorage.getItem('admin_token') || localStorage.getItem('linli_token') || ''; }
  function setToken(t) { localStorage.setItem('admin_token', t); }

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
  };
})();
