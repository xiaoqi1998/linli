/* ==========================================================================
   邻里鲜生 · 团长端应用逻辑
   ========================================================================== */
const Leader = (function () {

  async function init() {
    // always refresh token for demo reliability
    try {
      const res = await LeaderAPI.loginGuest();
      LeaderAPI.setToken(res.token);
    } catch (e) { console.error(e); }
    await go('dashboard');
  }

  async function go(tab) {
    document.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    const main = document.getElementById('app-main');
    main.innerHTML = '<div class="loading">加载中...</div>';
    try {
      let html = '';
      switch (tab) {
        case 'dashboard': html = await renderDashboard(); break;
        case 'orders': html = await renderOrders(); break;
        case 'group': html = await renderGroup(); break;
        case 'commission': html = await renderCommission(); break;
      }
      main.innerHTML = html;
    } catch (e) {
      main.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
    }
  }

  /* ---- Dashboard ---- */
  async function renderDashboard() {
    const data = await LeaderAPI.getDashboard();
    const t = data.today || {};
    const maxOrders = Math.max(...(data.trend || []).map(d => d.orderCount), 1);
    const fmt = (v) => (v == null ? 0 : v);

    return `
      <div class="stat-row">
        <div class="stat-card">
          <span class="stat-label">今日订单</span>
          <span class="stat-value green">${t.orderCount}</span>
          <span class="stat-sub">较昨日 ${fmt(t.orderCountChange) >= 0 ? '+' : ''}${fmt(t.orderCountChange)}%</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">今日成交额</span>
          <span class="stat-value">¥${t.salesAmount}</span>
          <span class="stat-sub">较昨日 ${fmt(t.salesAmountChange) >= 0 ? '+' : ''}${fmt(t.salesAmountChange)}%</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">今日佣金</span>
          <span class="stat-value green">¥${t.commission}</span>
          <span class="stat-sub">较昨日 ${fmt(t.commissionChange) >= 0 ? '+' : ''}${fmt(t.commissionChange)}%</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">待处理订单</span>
          <span class="stat-value orange">${t.pendingOrderCount}</span>
          <span class="stat-sub">需要尽快处理</span>
        </div>
      </div>

      <div class="quick-actions">
        <div class="quick-action" onclick="Leader.go('group')">
          <span class="qa-icon">🤝</span><span class="qa-label">一键开团</span>
        </div>
        <div class="quick-action" onclick="Leader.go('orders')">
          <span class="qa-icon">📦</span><span class="qa-label">订单管理</span>
        </div>
        <div class="quick-action" onclick="Leader.go('commission')">
          <span class="qa-icon">💰</span><span class="qa-label">佣金提现</span>
        </div>
        <div class="quick-action" onclick="Leader.toast('社群消息功能开发中')">
          <span class="qa-icon">💬</span><span class="qa-label">社群消息</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">近7天订单趋势</div>
        <div class="chart">
          ${(data.trend || []).map(d => `
            <div class="chart-bar">
              <div class="chart-bar-fill" style="height: ${(d.orderCount / maxOrders * 90)}px"></div>
              <span class="chart-bar-label">${d.date}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* ---- Orders ---- */
  let orderStatusFilter = '';

  async function renderOrders() {
    const data = await LeaderAPI.getOrders(orderStatusFilter || undefined);
    const orders = data.list || [];

    const tabs = [
      { v: '', l: '全部' }, { v: 20, l: '待配送' }, { v: 30, l: '配送中' }, { v: 50, l: '已完成' },
    ];

    return `
      <div class="section" style="padding:8px;margin-bottom:8px;">
        <div style="display:flex;gap:6px;">
          ${tabs.map(t => `<button class="btn btn-sm ${orderStatusFilter == t.v ? 'btn-primary' : 'btn-outline'}" onclick="Leader.filterOrders('${t.v}')">${t.l}</button>`).join('')}
        </div>
      </div>
      ${orders.length ? orders.map(o => orderCard(o)).join('') : '<div class="empty-state"><p>暂无订单</p></div>'}
    `;
  }

  function orderCard(o) {
    const items = o.items || [];
    const statusMap = { 10: ['待付款', 'orange'], 20: ['待配送', 'blue'], 30: ['配送中', 'blue'], 40: ['待确认', 'orange'], 50: ['已完成', 'green'], 99: ['已取消', 'gray'] };
    const [stext, scls] = statusMap[o.status] || ['未知', 'gray'];

    return `
      <div class="order-card">
        <div class="order-card-head">
          <span class="order-no">${o.order_no}</span>
          <span class="order-status ${scls}">${stext}</span>
        </div>
        ${items.map(it => `
          <div class="order-goods" style="margin-bottom:6px">
            <span class="order-goods-img">📦</span>
            <div class="order-goods-info">
              <div class="order-goods-name">${it.sku_name}</div>
              <div class="order-goods-spec">${it.spec_name || it.sku_spec_name || ''} x${it.quantity}</div>
            </div>
            <span style="font-size:13px">¥${(Number(it.total_amount != null ? it.total_amount : (it.price * it.quantity)) || 0).toFixed(2)}</span>
          </div>
        `).join('')}
        <div class="order-card-foot">
          <span style="font-size:12px;color:var(--text-light)">${o.created_at || ''}</span>
          <span class="order-total">合计 <strong>¥${Number(o.pay_amount || 0).toFixed(2)}</strong></span>
        </div>
      </div>
    `;
  }

  function filterOrders(status) {
    orderStatusFilter = status;
    go('orders');
  }

  /* ---- Group Buy ---- */
  let leaderProducts = [];

  async function renderGroup() {
    const data = await LeaderAPI.getGroupBuys(1);
    const gbs = Array.isArray(data) ? data : (data.list || []);

    // Load products for group buy creation
    try {
      const prodData = await LeaderAPI.getProducts();
      leaderProducts = prodData.list || [];
    } catch (e) {
      leaderProducts = [];
    }

    return `
      <div class="section">
        <div class="section-title">
          <span>进行中的拼团</span>
          <button class="btn btn-primary btn-sm" onclick="Leader.showCreateGroup()">+ 开团</button>
        </div>
        ${gbs.length ? gbs.map(gb => {
          const percent = Math.round((gb.joinedCount / gb.targetCount) * 100);
          const remain = gb.targetCount - gb.joinedCount;
          const name = gb.skuName || gb.groupName || gb.name || '商品';
          const emoji = name.includes('苹果') ? '🍎' : name.includes('米') ? '🍚' : name.includes('牛奶') ? '🥛' : name.includes('蛋') ? '🥚' : name.includes('番茄') ? '🍅' : '🛒';
          return `
            <div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);">
              <div style="width:60px;height:60px;border-radius:10px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:28px;">${emoji}</div>
              <div style="flex:1">
                <div style="font-size:14px;font-weight:600;">${name}</div>
                <div style="margin:4px 0;"><span style="color:var(--primary-dark);font-weight:700;font-size:16px;">¥${gb.groupPrice}</span> <span style="color:var(--text-light);text-decoration:line-through;font-size:12px;">¥${gb.marketPrice || gb.originalPrice || gb.salePrice}</span></div>
                <div style="background:var(--bg);border-radius:8px;height:6px;overflow:hidden;"><div style="background:var(--primary);height:100%;width:${percent}%;border-radius:8px;"></div></div>
                <div style="font-size:11px;color:var(--text-light);margin-top:2px;">已拼 ${gb.joinedCount}/${gb.targetCount} 人，还差 ${remain} 人</div>
              </div>
            </div>
          `;
        }).join('') : '<div class="empty-state"><p>暂无进行中的拼团</p></div>'}
      </div>

      <div class="section">
        <div class="section-title">社群运营工具</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${[
            { icon: '🌅', label: '早安上新', text: '早安邻居！今日新鲜到货，戳卡片下单' },
            { icon: '🔥', label: '特价提醒', text: 'XX商品限时特价，手慢无' },
            { icon: '🤝', label: '拼团召集', text: '还差X人成团，快来参团' },
            { icon: '📦', label: '到货通知', text: '您订阅的XX已到货' },
            { icon: '❄️', label: '天气关怀', text: '降温了，火锅食材备起来' },
            { icon: '📸', label: '晒单邀请', text: '收到货的邻居来晒个单' },
          ].map(t => `
            <div style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer;" onclick="Leader.copyText('${t.text}')">
              <div style="font-size:24px;">${t.icon}</div>
              <div style="font-size:13px;font-weight:600;margin-top:4px;">${t.label}</div>
              <div style="font-size:11px;color:var(--text-light);margin-top:2px;">点击复制文案</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function showCreateGroup() {
    if (!leaderProducts.length) {
      toast('暂无可开团商品');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;width:100%;max-width:430px;border-radius:16px 16px 0 0;padding:20px;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:18px;font-weight:700;">一键开团</h3>
          <span style="font-size:24px;cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">×</span>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">选择商品</label>
          <select id="gb-product" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;background:#fff;">
            ${leaderProducts.map(p => `<option value="${p.id}" data-price="${p.sale_price}" data-name="${p.name}">${p.name} (售价¥${p.sale_price}/${p.unit || '份'})</option>`).join('')}
          </select>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">拼团价 (元)</label>
          <input type="number" id="gb-price" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;" placeholder="请输入拼团价" step="0.01" />
          <div style="font-size:11px;color:var(--text-light);margin-top:4px;" id="gb-price-hint">需低于商品原价</div>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">成团人数</label>
          <input type="number" id="gb-target" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;" placeholder="如: 10" min="2" max="100" value="10" />
        </div>

        <div style="margin-bottom:20px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">截止时间</label>
          <select id="gb-expire" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;background:#fff;">
            <option value="6">6小时</option>
            <option value="12">12小时</option>
            <option value="24" selected>24小时</option>
            <option value="48">48小时</option>
          </select>
        </div>

        <button id="gb-submit" style="width:100%;height:48px;background:var(--primary);color:#fff;border:none;border-radius:24px;font-size:16px;font-weight:700;" onclick="Leader.submitGroup()">确认开团</button>
      </div>
    `;
    document.body.appendChild(modal);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Auto-fill price hint
    const select = document.getElementById('gb-product');
    const priceInput = document.getElementById('gb-price');
    const hint = document.getElementById('gb-price-hint');
    function updateHint() {
      const selected = select.options[select.selectedIndex];
      const origPrice = parseFloat(selected.dataset.price);
      hint.textContent = `原价 ¥${origPrice.toFixed(2)}，建议拼团价不高于 ¥${(origPrice * 0.9).toFixed(2)}`;
      if (!priceInput.value) priceInput.value = (origPrice * 0.85).toFixed(2);
    }
    select.addEventListener('change', updateHint);
    updateHint();
  }

  async function submitGroup() {
    const skuId = parseInt(document.getElementById('gb-product').value);
    const groupPrice = parseFloat(document.getElementById('gb-price').value);
    const targetCount = parseInt(document.getElementById('gb-target').value);
    const expireHours = parseInt(document.getElementById('gb-expire').value);

    if (!skuId || !groupPrice || !targetCount) {
      toast('请填写完整信息');
      return;
    }

    const btn = document.getElementById('gb-submit');
    btn.disabled = true;
    btn.textContent = '开团中...';

    try {
      const res = await LeaderAPI.createGroupBuy({ skuId, groupPrice, targetCount, expireHours });
      document.querySelector('.modal-overlay')?.remove();
      toast('开团成功！已生成拼团链接');
      go('group');
    } catch (e) {
      toast(e.message || '开团失败');
      btn.disabled = false;
      btn.textContent = '确认开团';
    }
  }

  /* ---- Commission ---- */
  async function renderCommission() {
    const data = await LeaderAPI.getCommission();
    const records = data.list || [];

    return `
      <div class="withdraw-card">
        <div class="withdraw-label">可提现佣金 (元)</div>
        <div class="withdraw-balance">¥${parseFloat(data.withdrawable || 0).toFixed(2)}</div>
        <button class="withdraw-btn" onclick="Leader.toast('提现功能开发中')">提现到账户</button>
      </div>

      <div class="stat-row">
        <div class="stat-card">
          <span class="stat-label">累计佣金</span>
          <span class="stat-value green">¥${parseFloat(data.total || 0).toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">佣金记录</span>
          <span class="stat-value">${records.length}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">佣金明细</div>
        ${records.length ? records.map(r => `
          <div class="comm-item">
            <div class="comm-info">
              <div class="comm-order">${r.order_no || '订单#' + r.order_id}</div>
              <div class="comm-time">${r.created_at || ''}</div>
            </div>
            <div class="comm-amount">+¥${parseFloat(r.amount || 0).toFixed(2)}</div>
          </div>
        `).join('') : '<div class="empty-state"><p>暂无佣金记录</p></div>'}
      </div>
    `;
  }

  /* ---- Utils ---- */
  function toast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function copyText(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast('文案已复制'));
    } else {
      toast('文案已复制: ' + text.substring(0, 20) + '...');
    }
  }

  return { init, go, toast, filterOrders, copyText, showCreateGroup, submitGroup };
})();

document.addEventListener('DOMContentLoaded', () => Leader.init());
