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
    // 若非团长（无法获取工作台数据），则展示申请表单
    try {
      await LeaderAPI.getDashboard();
    } catch (e) {
      await go('apply');
      return;
    }
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
        case 'withdraw': html = await renderWithdraw(); break;
        case 'refunds': html = await renderRefunds(); break;
        case 'customers': html = await renderCustomers(); break;
        case 'marketing': html = await renderMarketing(); break;
        case 'apply': html = await renderApply(); break;
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
        <button class="withdraw-btn" onclick="Leader.go('withdraw')">提现到账户</button>
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

  /* ---- Withdraw (提现) ---- */
  async function renderWithdraw() {
    const comm = await LeaderAPI.getCommission();
    const history = await LeaderAPI.getWithdrawHistory().catch(() => ({ list: [] }));
    const withdrawable = parseFloat(comm.withdrawable || 0).toFixed(2);
    const records = history.list || [];
    const statusMap = { 0: ['处理中', 'orange'], 1: ['已到账', 'green'], 2: ['已拒绝', 'red'] };

    return `
      <div class="withdraw-card">
        <div class="withdraw-label">可提现佣金 (元)</div>
        <div class="withdraw-balance">¥${withdrawable}</div>
      </div>

      <div class="section">
        <div class="section-title">申请提现</div>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">提现金额 (最低10元)</label>
          <input type="number" id="wd-amount" min="10" step="0.01" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:16px;" placeholder="请输入提现金额" />
        </div>
        <button id="wd-submit" class="btn btn-primary btn-block" onclick="Leader.submitWithdraw('${withdrawable}')">确认提现</button>
      </div>

      <div class="section">
        <div class="section-title">提现记录</div>
        ${records.length ? records.map(r => {
          const [stext, scls] = statusMap[r.status] || ['未知', 'gray'];
          return `
            <div class="comm-item">
              <div class="comm-info">
                <div class="comm-order">提现 ¥${parseFloat(r.amount || 0).toFixed(2)}</div>
                <div class="comm-time">${r.createdAt || r.created_at || ''}</div>
              </div>
              <span class="badge badge-${scls}">${stext}</span>
            </div>
          `;
        }).join('') : '<div class="empty-state"><p>暂无提现记录</p></div>'}
      </div>
    `;
  }

  async function submitWithdraw(maxAmount) {
    const amount = parseFloat(document.getElementById('wd-amount').value);
    if (!amount || amount < 10) { toast('提现金额不能低于10元'); return; }
    if (amount > parseFloat(maxAmount)) { toast('提现金额超过可提现额度'); return; }
    const btn = document.getElementById('wd-submit');
    btn.disabled = true; btn.textContent = '提交中...';
    try {
      await LeaderAPI.requestWithdraw(amount);
      toast('提现申请已提交');
      go('withdraw');
    } catch (e) {
      toast(e.message || '提现失败');
      btn.disabled = false; btn.textContent = '确认提现';
    }
  }

  /* ---- Refunds (售后处理) ---- */
  async function renderRefunds() {
    const data = await LeaderAPI.getRefunds();
    const refunds = data.list || [];

    return `
      <div class="section" style="padding:10px;margin-bottom:8px;">
        <div style="font-size:13px;color:var(--text-secondary);">待处理售后申请 · ${refunds.length} 条</div>
      </div>
      ${refunds.length ? refunds.map(r => `
        <div class="order-card">
          <div class="order-card-head">
            <span class="order-no">${r.orderNo || '订单#' + r.orderId}</span>
            <span class="badge badge-orange">待处理</span>
          </div>
          <div style="font-size:13px;margin-bottom:4px;">
            <span style="color:var(--text-light);">申请人：</span>${r.userName || r.user_name || '用户'}
          </div>
          <div style="font-size:13px;margin-bottom:4px;">
            <span style="color:var(--text-light);">退款金额：</span><strong style="color:var(--danger);">¥${parseFloat(r.amount || 0).toFixed(2)}</strong>
          </div>
          <div style="font-size:13px;margin-bottom:4px;">
            <span style="color:var(--text-light);">申请原因：</span>${r.reason || '无'}
          </div>
          <div style="font-size:11px;color:var(--text-light);margin-bottom:10px;">${r.createdAt || r.created_at || ''}</div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" style="flex:1;" onclick="Leader.approveRefund(${r.id})">同意退款</button>
            <button class="btn btn-outline btn-sm" style="flex:1;" onclick="Leader.showRejectRefund(${r.id})">拒绝</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state"><p>暂无售后申请</p></div>'}
    `;
  }

  async function approveRefund(id) {
    if (!confirm('确认同意该退款申请？')) return;
    try {
      await LeaderAPI.approveRefund(id);
      toast('已同意退款');
      go('refunds');
    } catch (e) { toast(e.message || '操作失败'); }
  }

  function showRejectRefund(id) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;width:100%;max-width:430px;border-radius:16px 16px 0 0;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:18px;font-weight:700;">拒绝退款原因</h3>
          <span style="font-size:24px;cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">×</span>
        </div>
        <textarea id="rj-reason" style="width:100%;height:100px;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-size:14px;" placeholder="请输入拒绝原因"></textarea>
        <button id="rj-submit" class="btn btn-primary btn-block" style="margin-top:12px;" onclick="Leader.submitReject(${id})">确认拒绝</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  async function submitReject(id) {
    const reason = document.getElementById('rj-reason').value.trim();
    if (!reason) { toast('请输入拒绝原因'); return; }
    const btn = document.getElementById('rj-submit');
    btn.disabled = true; btn.textContent = '提交中...';
    try {
      await LeaderAPI.rejectRefund(id, reason);
      document.querySelector('.modal-overlay')?.remove();
      toast('已拒绝退款');
      go('refunds');
    } catch (e) {
      toast(e.message || '操作失败');
      btn.disabled = false; btn.textContent = '确认拒绝';
    }
  }

  /* ---- Customers (客户管理) ---- */
  async function renderCustomers() {
    const custData = await LeaderAPI.getCustomers();
    const segData = await LeaderAPI.getCustomerSegments().catch(() => ({}));
    const customers = custData.list || [];
    const seg = segData || {};

    return `
      <div class="stat-row">
        <div class="stat-card">
          <span class="stat-label">高价值客户</span>
          <span class="stat-value green">${seg.highValue?.count || seg.highValue || 0}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">活跃客户</span>
          <span class="stat-value">${seg.active?.count || seg.active || 0}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">沉睡客户</span>
          <span class="stat-value orange">${seg.sleeping?.count || seg.dormant || 0}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">客户总数</span>
          <span class="stat-value">${customers.length}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">客户列表</div>
        ${customers.length ? customers.map(c => {
          const uid = c.userId || c.id;
          const name = c.nickName || c.nickname || c.name || '用户';
          const tags = c.tags || [];
          return `
            <div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);">
              <div style="width:40px;height:40px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--primary-dark);font-weight:600;">${name.charAt(0)}</div>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:14px;font-weight:600;">${name}</span>
                  <span style="font-size:12px;color:var(--text-light);">下单 ${c.orderCount || 0} 次</span>
                </div>
                <div style="font-size:12px;color:var(--text-light);margin-top:2px;">累计消费 ¥${parseFloat(c.totalConsume || 0).toFixed(2)}</div>
                <div style="font-size:11px;color:var(--text-light);margin-top:2px;">最近下单 ${c.lastOrderTime || '无'}</div>
                ${tags.length ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">${tags.map(t => `<span class="badge badge-blue" style="cursor:pointer;" onclick="Leader.removeCustomerTag(${uid}, '${String(t).replace(/'/g, "\\'")}')">${t} ×</span>`).join('')}</div>` : ''}
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <button class="btn btn-outline btn-sm" onclick="Leader.showAddTag(${uid})">添加标签</button>
                  <button class="btn btn-primary btn-sm" onclick="Leader.showSendCoupon(${uid})">发优惠券</button>
                </div>
              </div>
            </div>
          `;
        }).join('') : '<div class="empty-state"><p>暂无客户</p></div>'}
      </div>
    `;
  }

  function showAddTag(userId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;width:100%;max-width:430px;border-radius:16px 16px 0 0;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:18px;font-weight:700;">添加客户标签</h3>
          <span style="font-size:24px;cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">×</span>
        </div>
        <input type="text" id="tag-input" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;" placeholder="如：高价值、爱吃水果、宝妈" />
        <button id="tag-submit" class="btn btn-primary btn-block" style="margin-top:12px;" onclick="Leader.submitAddTag(${userId})">确认添加</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  async function submitAddTag(userId) {
    const tag = document.getElementById('tag-input').value.trim();
    if (!tag) { toast('请输入标签'); return; }
    const btn = document.getElementById('tag-submit');
    btn.disabled = true; btn.textContent = '提交中...';
    try {
      await LeaderAPI.addCustomerTag(userId, tag);
      document.querySelector('.modal-overlay')?.remove();
      toast('标签已添加');
      go('customers');
    } catch (e) {
      toast(e.message || '操作失败');
      btn.disabled = false; btn.textContent = '确认添加';
    }
  }

  async function removeCustomerTag(userId, tag) {
    if (!confirm(`移除标签「${tag}」？`)) return;
    try {
      await LeaderAPI.removeCustomerTag(userId, tag);
      toast('标签已移除');
      go('customers');
    } catch (e) { toast(e.message || '操作失败'); }
  }

  function showSendCoupon(userId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;width:100%;max-width:430px;border-radius:16px 16px 0 0;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:18px;font-weight:700;">发送优惠券</h3>
          <span style="font-size:24px;cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">×</span>
        </div>
        <div style="margin-bottom:12px;font-size:13px;color:var(--text-light);">选择优惠券发放给该客户</div>
        <select id="coupon-select" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;background:#fff;">
          <option value="1">满50减5 优惠券</option>
          <option value="2">满100减15 优惠券</option>
          <option value="3">新人立减10 优惠券</option>
          <option value="4">免费配送券</option>
        </select>
        <button id="coupon-submit" class="btn btn-primary btn-block" style="margin-top:12px;" onclick="Leader.submitSendCoupon(${userId})">发送优惠券</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  async function submitSendCoupon(userId) {
    const couponId = parseInt(document.getElementById('coupon-select').value);
    const btn = document.getElementById('coupon-submit');
    btn.disabled = true; btn.textContent = '发送中...';
    try {
      await LeaderAPI.sendCustomerCoupon(userId, couponId);
      document.querySelector('.modal-overlay')?.remove();
      toast('优惠券已发送');
    } catch (e) {
      toast(e.message || '发送失败');
      btn.disabled = false; btn.textContent = '发送优惠券';
    }
  }

  /* ---- Marketing (社群营销 / 模板消息) ---- */
  const TEMPLATES = [
    { id: 'morning_new', icon: '🌅', label: '早安上新', text: '早安邻居！今日新鲜到货，戳卡片下单' },
    { id: 'sale_alert', icon: '🔥', label: '特价提醒', text: 'XX商品限时特价，手慢无' },
    { id: 'group_call', icon: '🤝', label: '拼团召集', text: '还差X人成团，快来参团' },
    { id: 'arrive_notice', icon: '📦', label: '到货通知', text: '您订阅的XX已到货，请到提货点取件' },
    { id: 'weather_care', icon: '❄️', label: '天气关怀', text: '降温了，火锅食材备起来' },
    { id: 'share_invite', icon: '📸', label: '晒单邀请', text: '收到货的邻居来晒个单吧' },
    { id: 'repurchase', icon: '🔁', label: '复购提醒', text: '您常买的XX该补货啦' },
    { id: 'thanks', icon: '💝', label: '感谢回访', text: '感谢您的支持，送您专属优惠券' },
  ];
  let marketingTemplates = TEMPLATES;

  async function renderMarketing() {
    const histData = await LeaderAPI.getTemplateMessageHistory().catch(() => ({ list: [] }));
    const history = histData.list || [];

    try {
      const res = await LeaderAPI.getTemplateMessages();
      const list = Array.isArray(res) ? res : (res.list || []);
      if (list.length) marketingTemplates = list;
    } catch (e) {
      // fall back to hardcoded TEMPLATES
    }

    return `
      <div class="section">
        <div class="section-title">营销模板 (点击编辑发送)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${marketingTemplates.map((t, i) => `
            <div style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer;" onclick="Leader.showTemplateEditor(${i})">
              <div style="font-size:24px;">${t.icon || '📝'}</div>
              <div style="font-size:13px;font-weight:600;margin-top:4px;">${t.label || t.name || t.title || '模板'}</div>
              <div style="font-size:11px;color:var(--text-light);margin-top:2px;">点击编辑发送</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="section">
        <div class="section-title">发送历史</div>
        ${history.length ? history.map(h => `
          <div class="comm-item">
            <div class="comm-info">
              <div class="comm-order">${h.templateType || h.template_name || '营销消息'}</div>
              <div class="comm-time">${h.createdAt || h.created_at || ''}</div>
            </div>
            <span style="font-size:12px;color:var(--text-light);">${h.content || ''}</span>
          </div>
        `).join('') : '<div class="empty-state"><p>暂无发送记录</p></div>'}
      </div>
    `;
  }

  function showTemplateEditor(idx) {
    const t = marketingTemplates[idx];
    const tId = t.id || t.templateType;
    const tLabel = t.label || t.name || t.title || '营销消息';
    const tIcon = t.icon || '📝';
    const tText = t.text || t.content || '';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;width:100%;max-width:430px;border-radius:16px 16px 0 0;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:18px;font-weight:700;">${tIcon} ${tLabel}</h3>
          <span style="font-size:24px;cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">×</span>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">消息内容</label>
          <textarea id="tpl-content" style="width:100%;height:100px;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-size:14px;">${tText}</textarea>
        </div>
        <button id="tpl-submit" class="btn btn-primary btn-block" onclick="Leader.sendTemplate('${tId}', '${tLabel}')">发送到社群</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  async function sendTemplate(templateId, templateName) {
    const content = document.getElementById('tpl-content').value.trim();
    if (!content) { toast('请输入消息内容'); return; }
    const btn = document.getElementById('tpl-submit');
    btn.disabled = true; btn.textContent = '发送中...';
    try {
      await LeaderAPI.sendTemplateMessage({ templateType: templateId, content, shareUrl: '' });
      document.querySelector('.modal-overlay')?.remove();
      toast('已发送到社群');
      go('marketing');
    } catch (e) {
      toast(e.message || '发送失败');
      btn.disabled = false; btn.textContent = '发送到社群';
    }
  }

  /* ---- Apply Leader (申请成为团长) ---- */
  async function renderApply() {
    return `
      <div class="section">
        <div class="section-title">申请成为团长</div>
        <div style="font-size:13px;color:var(--text-light);margin-bottom:14px;line-height:1.6;">填写以下信息申请成为社区团长，审核通过后即可开通工作台。</div>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">姓名</label>
          <input type="text" id="ap-name" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;" placeholder="请输入您的姓名" />
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">手机号</label>
          <input type="tel" id="ap-phone" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;" placeholder="请输入手机号" maxlength="11" />
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">所在社区</label>
          <select id="ap-community" style="width:100%;height:44px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;background:#fff;">
            <option value="">请选择社区</option>
            <option value="1">阳光花园社区</option>
            <option value="2">翠湖天地社区</option>
            <option value="3">幸福里社区</option>
            <option value="4">和平家园社区</option>
          </select>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px;">申请理由</label>
          <textarea id="ap-reason" style="width:100%;height:80px;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-size:14px;" placeholder="请简要描述您的优势和社区资源"></textarea>
        </div>
        <button id="ap-submit" class="btn btn-primary btn-block" onclick="Leader.submitApply()">提交申请</button>
      </div>
    `;
  }

  async function submitApply() {
    const name = document.getElementById('ap-name').value.trim();
    const phone = document.getElementById('ap-phone').value.trim();
    const communityId = document.getElementById('ap-community').value;
    const reason = document.getElementById('ap-reason').value.trim();
    if (!name || !phone || !communityId) { toast('请填写完整信息'); return; }
    if (!/^1\d{10}$/.test(phone)) { toast('请输入正确的手机号'); return; }
    const btn = document.getElementById('ap-submit');
    btn.disabled = true; btn.textContent = '提交中...';
    try {
      await LeaderAPI.applyLeader({ name, phone, communityId: parseInt(communityId), reason });
      toast('申请已提交，等待审核');
      go('dashboard');
    } catch (e) {
      toast(e.message || '申请失败');
      btn.disabled = false; btn.textContent = '提交申请';
    }
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

  return {
    init, go, toast, copyText,
    filterOrders, showCreateGroup, submitGroup,
    submitWithdraw, approveRefund, showRejectRefund, submitReject,
    showAddTag, submitAddTag, removeCustomerTag, showSendCoupon, submitSendCoupon,
    showTemplateEditor, sendTemplate,
    submitApply,
  };
})();

document.addEventListener('DOMContentLoaded', () => Leader.init());
