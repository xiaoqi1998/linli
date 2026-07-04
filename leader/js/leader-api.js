/* ==========================================================================
   邻里鲜生 · 团长端 API 客户端
   ========================================================================== */
const LeaderAPI = (function () {
  const BASE = '/api/v1';

  function getToken() { return localStorage.getItem('leader_token') || localStorage.getItem('linli_token') || ''; }
  function setToken(t) { localStorage.setItem('leader_token', t); }

  async function request(method, path, body) {
    const url = BASE + path;
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    const json = await resp.json();
    if (json.code !== 0) throw new Error(json.message || '请求失败');
    return json.data;
  }

  return {
    loginGuest: () => request('POST', '/auth/login-guest', {}),
    getToken, setToken,

    // Dashboard
    getDashboard: () => request('GET', '/leader/dashboard'),

    // Orders
    getOrders: (status) => {
      const q = status ? `?status=${status}` : '';
      return request('GET', `/leader/orders${q}`);
    },

    // Commission
    getCommission: () => request('GET', '/leader/commission'),

    // Group Buys (公开接口)
    getGroupBuys: (communityId) => {
      const q = communityId ? `?communityId=${communityId}` : '?communityId=1';
      return request('GET', `/group-buys${q}`);
    },

    // Leader Products (for creating group buy)
    getProducts: () => request('GET', '/leader/products'),

    // Create Group Buy
    createGroupBuy: (data) => request('POST', '/leader/group-buys', data),
  };
})();
