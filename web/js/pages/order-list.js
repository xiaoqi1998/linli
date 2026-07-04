/* ==========================================================================
   邻里鲜生 · 订单列表页
   ========================================================================== */
const OrderListPage = (function () {
  let orders = [];
  let activeTab = 'all';

  const TABS = [
    { key: 'all', label: '全部' },
    { key: '10', label: '待付款' },
    { key: '20', label: '待配送' },
    { key: '30', label: '配送中' },
    { key: '50', label: '已完成' },
  ];

  async function render() {
    activeTab = App.state.orderFilter || 'all';
    try {
      const data = await API.getOrders();
      orders = data.list || data || [];
    } catch (e) {
      orders = API.mock.ORDERS;
    }
    return renderView();
  }

  function renderView() {
    const filtered = activeTab === 'all' ? orders : orders.filter(o => String(o.status) === activeTab);

    return `
      <div class="page order-list-page">
        <div class="order-tabs">
          ${TABS.map(t => `
            <div class="order-tab ${activeTab === t.key ? 'active' : ''}" onclick="OrderListPage.switchTab('${t.key}')">${t.label}</div>
          `).join('')}
        </div>
        <div style="padding-top:4px;">
          ${filtered.length === 0
            ? App.emptyState('📋', '暂无订单', '快去下一单试试吧', '去逛逛', "App.go('home')")
            : filtered.map(o => orderCardHtml(o)).join('')
          }
        </div>
        <div style="height:20px;"></div>
      </div>
    `;
  }

  function orderCardHtml(o) {
    const items = o.items || [];
    const showItems = items.slice(0, 3);
    const moreCount = items.length - 3;

    return `
      <div class="order-card" onclick="App.go('order-detail/${o.orderNo}')">
        <div class="order-card-head">
          <span class="order-no">订单号：${o.orderNo}</span>
          <span class="order-status ${App.statusClass(o.status)}">${App.statusText(o.status)}</span>
        </div>
        <div class="order-goods">
          ${showItems.map(it => `
            <div class="order-goods-img ${it.bg || 'bg-veg'}">${it.emoji || '📦'}</div>
          `).join('')}
          ${moreCount > 0 ? `<div class="order-goods-more">+${moreCount}</div>` : ''}
        </div>
        <div class="order-card-foot">
          <span class="order-time">${o.createdAt || ''}</span>
          <span class="order-total">共${items.length}件 合计 <strong>¥${(o.payAmount || 0).toFixed(2)}</strong></span>
        </div>
        <div class="order-card-actions">
          ${o.status === 10 ? `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();OrderListPage.cancel('${o.orderNo}')">取消</button><button class="btn btn-sm btn-primary" onclick="event.stopPropagation();OrderListPage.pay('${o.orderNo}')">付款</button>` : ''}
          ${o.status === 40 || o.status === 30 ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();OrderListPage.confirm('${o.orderNo}')">确认收货</button>` : ''}
          ${o.status === 50 ? `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();App.go('home')">再来一单</button>` : ''}
        </div>
      </div>
    `;
  }

  function switchTab(key) {
    activeTab = key;
    App.state.orderFilter = key;
    const page = document.getElementById('page-container') || document.querySelector('.page') || document.querySelector('.app-content');
    if (page) page.innerHTML = renderView();
  }

  function getPageEl() {
    return document.getElementById('page-container') || document.querySelector('.page') || document.querySelector('.app-content');
  }

  async function cancel(orderNo) {
    try {
      await API.cancelOrder(orderNo);
      App.toast('订单已取消');
      render().then(html => { const p = getPageEl(); if (p) p.innerHTML = html; });
    } catch (e) { App.toast('操作失败'); }
  }

  async function pay(orderNo) {
    try {
      await API.payOrder(orderNo);
      App.toast('支付成功！');
      render().then(html => { const p = getPageEl(); if (p) p.innerHTML = html; });
    } catch (e) { App.toast('支付失败'); }
  }

  async function confirm(orderNo) {
    try {
      await API.confirmOrder(orderNo);
      App.toast('确认收货成功！');
      render().then(html => { const p = getPageEl(); if (p) p.innerHTML = html; });
    } catch (e) { App.toast('操作失败'); }
  }

  return { render, switchTab, cancel, pay, confirm };
})();
