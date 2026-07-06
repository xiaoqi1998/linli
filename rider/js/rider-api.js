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
    if (!res.ok) throw new Error(json.message || '请求失败');
    return json;
  }

  async function login(phone) {
    const res = await request('POST', '/auth/login', { phone });
    if (res.token) setToken(res.token);
    return res;
  }

  async function loginGuest() {
    const res = await request('POST', '/auth/login-guest', { role: 'rider' });
    if (res.token) setToken(res.token);
    return res;
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
  };
})();