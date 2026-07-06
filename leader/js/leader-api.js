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

    // Withdrawal
    requestWithdraw: (amount) => request('POST', '/leader/withdraw', { amount }),
    getWithdrawHistory: () => request('GET', '/leader/withdraw/history'),

    // Refunds (after-sales)
    getRefunds: () => request('GET', '/leader/refunds'),
    approveRefund: (id) => request('POST', `/leader/refunds/${id}/approve`),
    rejectRefund: (id, reason) => request('POST', `/leader/refunds/${id}/reject`, { reason }),

    // Customer management
    getCustomers: () => request('GET', '/leader/customers'),
    getCustomerSegments: () => request('GET', '/leader/customers/segments'),
    addCustomerTag: (userId, tag) => request('POST', `/leader/customers/${userId}/tag`, { tag }),
    removeCustomerTag: (userId, tag) => request('DELETE', `/leader/customers/${userId}/tag/${tag}`),
    sendCustomerCoupon: (userId, couponId) => request('POST', `/leader/customers/${userId}/coupon`, { couponId }),

    // Template messages
    getTemplateMessages: () => request('GET', '/leader/template-messages'),
    sendTemplateMessage: (data) => request('POST', '/leader/template-messages/send', data),
    getTemplateMessageHistory: () => request('GET', '/leader/template-messages/history'),

    // Leader application
    applyLeader: (data) => request('POST', '/leader/apply', data),

    // Order detail
    getOrderDetail: (id) => request('GET', `/leader/orders/${id}`),
  };
})();
