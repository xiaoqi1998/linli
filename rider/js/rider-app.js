const Rider = (function () {
  let currentTab = 'orders';
  let riderInfo = null;
  let warehouses = [];
  let currentWarehouseId = null;
  let orders = [];
  let todayStats = null;
  let locationTimer = null;
  let refreshTimer = null;

  async function init() {
    try {
      const res = await RiderAPI.loginGuest();
      const profile = await RiderAPI.getProfile();
      riderInfo = profile.rider;
      warehouses = profile.warehouses || [];
      currentWarehouseId = warehouses.length > 0
        ? (warehouses.find(w => w.is_default)?.id || warehouses[0].id)
        : null;
      updateHeader();
      startLocationTracking();
      startOrderRefresh();
      await go('orders');
    } catch (e) {
      console.error('初始化失败:', e);
      renderInitError(e.message || '初始化失败，请检查网络或联系管理员');
    }
  }

  function renderInitError(msg) {
    const main = document.getElementById('app-main');
    if (main) {
      main.innerHTML = `
        <div class="empty-state" style="padding-top:40vh;">
          <span class="empty-emoji">⚠️</span>
          <div class="empty-desc">${msg}</div>
          <div style="margin-top:16px;display:flex;gap:12px;justify-content:center;">
            <button class="btn btn-primary" onclick="Rider.retryInit()">重新加载</button>
            <button class="btn btn-outline" onclick="Rider.logout()">退出</button>
          </div>
        </div>
      `;
    }
    const whEl = document.getElementById('current-warehouse');
    if (whEl) whEl.textContent = '暂无站点';
  }

  async function retryInit() {
    const main = document.getElementById('app-main');
    if (main) main.innerHTML = '<div class="loading">加载中...</div>';
    await init();
  }

  function updateHeader() {
    const nameEl = document.getElementById('rider-name');
    if (nameEl) nameEl.textContent = riderInfo?.name || '骑手';
    const statusEl = document.getElementById('online-status');
    if (statusEl) {
      statusEl.textContent = riderInfo ? '在线' : '离线';
      statusEl.className = 'status-badge ' + (riderInfo ? 'online' : '');
    }
    const whEl = document.getElementById('current-warehouse');
    if (whEl) {
      if (currentWarehouseId) {
        const wh = warehouses.find(w => w.id === currentWarehouseId);
        whEl.textContent = wh?.name || '选择站点';
      } else if (warehouses.length === 0) {
        whEl.textContent = '暂无站点';
      } else {
        whEl.textContent = '选择站点';
      }
    }
  }

  function showWarehouseSelector() {
    if (warehouses.length === 0) {
      toast('暂无可用站点');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    overlay.id = 'warehouse-sheet';
    overlay.innerHTML = `
      <div class="sheet-box">
        <div class="sheet-title">选择配送站点</div>
        <div class="warehouse-list">
          ${warehouses.map(w => `
            <div class="warehouse-item ${w.id === currentWarehouseId ? 'active' : ''}" onclick="Rider.switchWarehouse(${w.id})">
              <div class="warehouse-item-info">
                <div class="warehouse-item-name">${w.name}</div>
                <div class="warehouse-item-addr">${w.address || ''}</div>
              </div>
              ${w.id === currentWarehouseId ? '<span class="warehouse-item-check">✓</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  async function switchWarehouse(whId) {
    currentWarehouseId = whId;
    updateHeader();
    const sheet = document.getElementById('warehouse-sheet');
    if (sheet) sheet.remove();
    toast('已切换站点');
    await go(currentTab);
  }

  async function go(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    const main = document.getElementById('app-main');
    main.innerHTML = '<div class="loading">加载中...</div>';
    try {
      let html = '';
      switch (tab) {
        case 'orders': html = await renderOrders(); break;
        case 'delivering': html = await renderDelivering(); break;
        case 'history': html = await renderHistory(); break;
        case 'profile': html = await renderProfile(); break;
      }
      main.innerHTML = html;
      updateBadges();
    } catch (e) {
      main.innerHTML = `<div class="empty-state"><span class="empty-emoji">❌</span><div class="empty-desc">加载失败: ${e.message}</div></div>`;
    }
  }

  async function fetchOrders() {
    try {
      const data = await RiderAPI.getOrders(null, currentWarehouseId);
      orders = data.list || [];
    } catch (e) {
      orders = [];
    }
    return orders;
  }

  async function renderOrders() {
    await fetchOrders();
    const pending = orders.filter(o => o.status === 20);
    if (!pending.length) {
      return `<div class="empty-state"><span class="empty-emoji">📋</span><div class="empty-desc">暂无待接单订单</div></div>`;
    }
    return pending.map(o => orderCard(o, 'accept')).join('');
  }

  async function renderDelivering() {
    await fetchOrders();
    const delivering = orders.filter(o => o.status === 30);
    if (!delivering.length) {
      return `<div class="empty-state"><span class="empty-emoji">🚴</span><div class="empty-desc">暂无配送中订单</div></div>`;
    }
    const toPick = delivering.filter(o => o.deliveryStatus === 1);
    const toDeliver = delivering.filter(o => o.deliveryStatus === 2);
    let html = '';
    if (toPick.length > 0) {
      html += `<div class="section"><div class="section-title">待取货 (${toPick.length})</div></div>`;
      html += toPick.map(o => orderCard(o, 'pick')).join('');
    }
    if (toDeliver.length > 0) {
      html += `<div class="section"><div class="section-title">配送中 (${toDeliver.length})</div></div>`;
      html += toDeliver.map(o => orderCard(o, 'deliver')).join('');
    }
    return html;
  }

  async function renderHistory() {
    await fetchOrders();
    const history = orders.filter(o => o.status === 40);
    if (!history.length) {
      return `<div class="empty-state"><span class="empty-emoji">✅</span><div class="empty-desc">暂无已完成订单</div></div>`;
    }
    return history.map(o => orderCard(o, 'done')).join('');
  }

  function orderCard(o, actionType) {
    const statusMap = {
      20: { class: 'pending', text: '待接单' },
      25: { class: 'pickup', text: '待取货' },
      30: { class: 'delivering', text: '配送中' },
      40: { class: 'delivered', text: '已送达' },
      99: { class: 'cancelled', text: '已取消' },
    };
    const displayStatus = o.deliveryStatus === 1 && o.status === 30 ? 25 : o.status;
    const statusInfo = statusMap[displayStatus] || statusMap[o.status];
    const addr = o.address || {};
    const items = o.items || [];
    const wh = o.warehouse || {};

    let stepsHtml = '';
    if (actionType !== 'accept' && actionType !== 'done') {
      const steps = [
        { label: '接单', done: true, icon: '✓' },
        { label: '取货', done: o.deliveryStatus >= 2, current: o.deliveryStatus === 1, icon: o.deliveryStatus >= 2 ? '✓' : '2' },
        { label: '送达', done: o.deliveryStatus >= 3, current: o.deliveryStatus === 2, icon: o.deliveryStatus >= 3 ? '✓' : '3' },
      ];
      stepsHtml = `
        <div class="delivery-steps">
          ${steps.map(s => `
            <div class="step-item ${s.done ? 'done' : ''} ${s.current ? 'current' : ''}">
              <div class="step-dot">${s.icon}</div>
              <div class="step-label">${s.label}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    let actions = '';
    if (actionType === 'accept') {
      actions = `
        <div class="order-card-actions">
          <button class="btn btn-primary" onclick="Rider.acceptOrder(${o.id})">接单配送</button>
        </div>`;
    } else if (actionType === 'pick') {
      actions = `
        <div class="order-card-actions">
          <button class="btn btn-outline" onclick="Rider.callUser('${o.userPhone || ''}')">联系用户</button>
          <button class="btn btn-primary" onclick="Rider.pickOrder(${o.id})">确认取货</button>
        </div>`;
    } else if (actionType === 'deliver') {
      actions = `
        <div class="order-card-actions">
          <button class="btn btn-outline" onclick="Rider.callUser('${o.userPhone || ''}')">联系用户</button>
          <button class="btn btn-primary" onclick="Rider.deliverOrder(${o.id})">确认送达</button>
        </div>`;
    }

    const whHtml = wh.name ? `
      <div class="warehouse-info">
        <span class="warehouse-icon">🏪</span>
        <div class="warehouse-detail">
          <div class="warehouse-name">${wh.name}</div>
          <div class="warehouse-addr">${wh.address || ''}</div>
        </div>
      </div>
    ` : '';

    return `
      <div class="order-card">
        <div class="order-card-head">
          <span class="order-no">${o.orderNo}</span>
          <span class="order-status ${statusInfo.class}">${statusInfo.text}</span>
        </div>
        ${stepsHtml}
        ${whHtml}
        <div class="order-goods">
          ${items.slice(0, 3).map(it => `
            <div style="display:flex;gap:8px;margin-bottom:8px;width:100%;">
              <div class="order-goods-img">${getEmoji(it.sku_name)}</div>
              <div class="order-goods-info">
                <div class="order-goods-name">${it.sku_name}</div>
                <div class="order-goods-spec">${it.spec_name || ''} x${it.quantity}</div>
              </div>
            </div>
          `).join('')}
          ${items.length > 3 ? `<div style="font-size:12px;color:var(--text-light);width:100%;">+${items.length - 3}件商品</div>` : ''}
        </div>
        <div class="order-address">
          <span class="order-address-icon">📍</span>
          <div class="order-address-info">
            <div>
              <span class="order-address-name">${addr.name || o.userName || ''}</span>
              <span class="order-address-phone">${addr.phone || o.userPhone || ''}</span>
            </div>
            <div class="order-address-detail">${addr.detail || addr.detail_address || ''}</div>
          </div>
        </div>
        ${o.remark ? `<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;padding:8px 12px;background:#fefce8;border-radius:8px;">📝 备注: ${o.remark}</div>` : ''}
        <div class="order-card-foot">
          <span class="order-time">下单: ${o.payTime || ''}</span>
          <span class="order-total">¥${(o.payAmount || 0).toFixed(2)}</span>
        </div>
        ${actions}
      </div>
    `;
  }

  async function renderProfile() {
    let stats = { accepted: 0, picked: 0, delivered: 0, totalDistance: 0 };
    try {
      const s = await RiderAPI.getTodayStats();
      stats = s;
    } catch (e) {}

    return `
      <div class="rider-profile">
        <div class="rider-avatar">🛵</div>
        <div class="rider-name">${riderInfo?.name || '骑手'}</div>
        <div class="rider-phone">${riderInfo?.phone || ''}</div>
      </div>
      <div class="stat-row">
        <div class="stat-card">
          <span class="stat-label">今日接单</span>
          <span class="stat-value">${stats.accepted || 0}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">今日取货</span>
          <span class="stat-value orange">${stats.picked || 0}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">今日送达</span>
          <span class="stat-value">${stats.delivered || 0}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">配送里程</span>
          <span class="stat-value purple">${(stats.totalDistance || 0).toFixed(1)}km</span>
        </div>
      </div>
      <div class="rider-menu">
        <div class="rider-menu-item" onclick="Rider.showWarehouseSelector()">
          <span class="rider-menu-icon">🏪</span>
          <span class="rider-menu-text">配送站点</span>
          <span class="rider-menu-value">${warehouses.length}个站点</span>
          <span class="rider-menu-arrow">›</span>
        </div>
        <div class="rider-menu-item" onclick="Rider.toast('功能开发中')">
          <span class="rider-menu-icon">💰</span>
          <span class="rider-menu-text">收入明细</span>
          <span class="rider-menu-arrow">›</span>
        </div>
        <div class="rider-menu-item" onclick="Rider.toast('功能开发中')">
          <span class="rider-menu-icon">📊</span>
          <span class="rider-menu-text">配送统计</span>
          <span class="rider-menu-arrow">›</span>
        </div>
        <div class="rider-menu-item" onclick="Rider.toast('功能开发中')">
          <span class="rider-menu-icon">🎧</span>
          <span class="rider-menu-text">联系客服</span>
          <span class="rider-menu-arrow">›</span>
        </div>
        <div class="rider-menu-item" onclick="Rider.logout()">
          <span class="rider-menu-icon">🚪</span>
          <span class="rider-menu-text">退出登录</span>
          <span class="rider-menu-arrow">›</span>
        </div>
      </div>
    `;
  }

  function updateBadges() {
    const pending = orders.filter(o => o.status === 20).length;
    const delivering = orders.filter(o => o.status === 30).length;
    const badge1 = document.getElementById('order-badge');
    const badge2 = document.getElementById('delivering-badge');
    if (badge1) badge1.textContent = pending > 0 ? pending : '';
    if (badge2) badge2.textContent = delivering > 0 ? delivering : '';
  }

  async function acceptOrder(orderId) {
    showModal({
      title: '确认接单',
      body: '确定要接此订单进行配送吗？',
      confirmText: '确认接单',
      onConfirm: async () => {
        try {
          await RiderAPI.acceptOrder(orderId);
          toast('接单成功！');
          await go('delivering');
          return true;
        } catch (e) {
          toast(e.message || '接单失败');
          return false;
        }
      },
    });
  }

  async function pickOrder(orderId) {
    showModal({
      title: '确认取货',
      body: '请确认已在站点取到所有商品',
      confirmText: '确认取货',
      onConfirm: async () => {
        try {
          await RiderAPI.pickOrder(orderId);
          toast('取货成功，开始配送！');
          await go('delivering');
          return true;
        } catch (e) {
          toast(e.message || '取货失败');
          return false;
        }
      },
    });
  }

  async function deliverOrder(orderId) {
    showModal({
      title: '确认送达',
      body: '请确认已将商品送达给用户',
      confirmText: '确认送达',
      onConfirm: async () => {
        try {
          await RiderAPI.deliverOrder(orderId);
          toast('送达成功！');
          await go('delivering');
          return true;
        } catch (e) {
          toast(e.message || '送达失败');
          return false;
        }
      },
    });
  }

  function callUser(phone) {
    if (!phone) {
      toast('暂无联系电话');
      return;
    }
    if (window.location.protocol === 'tel:') {
      window.location.href = 'tel:' + phone;
    } else {
      showModal({
        title: '联系用户',
        body: `用户电话: ${phone}`,
        confirmText: '拨打',
        cancelText: '复制号码',
        onConfirm: () => {
          window.location.href = 'tel:' + phone;
          return true;
        },
        onCancel: () => {
          navigator.clipboard?.writeText(phone);
          toast('号码已复制');
          return true;
        },
      });
    }
  }

  function startLocationTracking() {
    if (locationTimer) clearInterval(locationTimer);
    locationTimer = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            RiderAPI.updateLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {});
          },
          () => {},
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }
    }, 10000);
  }

  function startOrderRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      if (currentTab === 'orders' || currentTab === 'delivering') {
        await fetchOrders();
        updateBadges();
        if (currentTab === 'orders') {
          const main = document.getElementById('app-main');
          if (main) main.innerHTML = await renderOrders();
        } else if (currentTab === 'delivering') {
          const main = document.getElementById('app-main');
          if (main) main.innerHTML = await renderDelivering();
        }
      }
    }, 30000);
  }

  function logout() {
    showModal({
      title: '退出登录',
      body: '确定要退出骑手端吗？',
      confirmText: '退出',
      onConfirm: () => {
        if (locationTimer) clearInterval(locationTimer);
        if (refreshTimer) clearInterval(refreshTimer);
        RiderAPI.setToken('');
        riderInfo = null;
        window.location.reload();
        return true;
      },
    });
  }

  function toast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function showModal({ title, body, cancelText = '取消', confirmText = '确定', onConfirm, onCancel }) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-title">${title}</div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="modal-cancel">${cancelText}</button>
          <button class="btn btn-primary" id="modal-confirm">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.getElementById('modal-confirm').onclick = async () => {
      const result = await onConfirm();
      if (result) modal.remove();
    };
    document.getElementById('modal-cancel').onclick = async () => {
      if (onCancel) {
        const result = await onCancel();
        if (result) modal.remove();
      } else {
        modal.remove();
      }
    };
  }

  function getEmoji(name) {
    if (!name) return '📦';
    if (name.includes('蔬菜') || name.includes('番茄') || name.includes('青菜') || name.includes('白菜') || name.includes('黄瓜') || name.includes('生菜') || name.includes('土豆') || name.includes('西红')) return '🥬';
    if (name.includes('水果') || name.includes('苹果') || name.includes('香蕉') || name.includes('橙子') || name.includes('葡萄') || name.includes('芒果')) return '🍎';
    if (name.includes('肉') || name.includes('蛋') || name.includes('鸡') || name.includes('猪') || name.includes('牛') || name.includes('牛仔骨') || name.includes('鸡胸')) return '🥚';
    if (name.includes('鱼') || name.includes('虾') || name.includes('蟹') || name.includes('三文') || name.includes('鲈')) return '🐟';
    if (name.includes('米') || name.includes('油') || name.includes('面') || name.includes('生抽') || name.includes('陈醋')) return '🍚';
    if (name.includes('奶') || name.includes('酸奶') || name.includes('奶酪') || name.includes('特仑苏') || name.includes('安慕希')) return '🥛';
    if (name.includes('饮料') || name.includes('水') || name.includes('酒') || name.includes('可乐') || name.includes('农夫')) return '🥤';
    if (name.includes('零食') || name.includes('饼干') || name.includes('糖果') || name.includes('坚果') || name.includes('奥利奥')) return '🍪';
    if (name.includes('纸巾') || name.includes('洗衣液') || name.includes('垃圾') || name.includes('洗洁精')) return '🧴';
    return '📦';
  }

  return {
    init,
    go,
    showWarehouseSelector,
    switchWarehouse,
    acceptOrder,
    pickOrder,
    deliverOrder,
    callUser,
    toast,
    logout,
    retryInit,
  };
})();

document.addEventListener('DOMContentLoaded', () => Rider.init());