const RiderAPI = (function () {
  const BASE_URL = '/api/v1';
  let token = '';

  function setToken(t) { token = t; }

  function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }

  async function request(method, path, data) {
    const options = { method, headers: getHeaders() };
    if (data) options.body = JSON.stringify(data);
    const res = await fetch(BASE_URL + path, options);
    const json = await res.json();
    if (!res.ok || json.code !== 0) throw new Error(json.message || '请求失败');
    return json.data;
  }

  async function login(phone, password) {
    const data = await request('POST', '/auth/rider-login', { phone, password });
    if (data?.token) setToken(data.token);
    return data;
  }

  async function loginGuest() {
    const data = await request('POST', '/auth/login-guest', { role: 'rider' });
    if (data?.token) setToken(data.token);
    return data;
  }

  async function getProfile() {
    return request('GET', '/rider/profile');
  }

  async function getWarehouses() {
    return request('GET', '/rider/warehouses');
  }

  async function getOrders(status, warehouseId) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (warehouseId) params.set('warehouse_id', warehouseId);
    const query = params.toString() ? '?' + params.toString() : '';
    return request('GET', '/rider/orders' + query);
  }

  async function getTodayStats() {
    return request('GET', '/rider/orders/today-stats');
  }

  async function acceptOrder(orderId) {
    return request('POST', `/rider/orders/${orderId}/accept`);
  }

  async function arrivePick(orderId) {
    return request('POST', `/rider/orders/${orderId}/arrive-pick`);
  }

  async function pickOrder(orderId) {
    return request('POST', `/rider/orders/${orderId}/pick`);
  }

  async function arriveDeliver(orderId) {
    return request('POST', `/rider/orders/${orderId}/arrive-deliver`);
  }

  async function deliverOrder(orderId) {
    return request('POST', `/rider/orders/${orderId}/deliver`);
  }

  async function updateLocation(lat, lng) {
    return request('POST', '/rider/location', { lat, lng });
  }

  async function updateStatus(status) {
    return request('POST', '/rider/status', { status });
  }

  async function getIncome(page = 1, pageSize = 20) {
    return request('GET', `/rider/income?page=${page}&page_size=${pageSize}`);
  }

  async function getStats(days = 7) {
    return request('GET', `/rider/stats?days=${days}`);
  }

  async function getOrderDetail(orderId) {
    return request('GET', `/rider/orders/${orderId}`);
  }

  async function resetPassword(phone, newPassword) {
    return request('POST', '/auth/rider-reset-password', { phone, newPassword });
  }

  return {
    setToken,
    login,
    loginGuest,
    getProfile,
    getWarehouses,
    getOrders,
    getTodayStats,
    acceptOrder,
    arrivePick,
    pickOrder,
    arriveDeliver,
    deliverOrder,
    updateLocation,
    updateStatus,
    getIncome,
    getStats,
    getOrderDetail,
    resetPassword,
  };
})();