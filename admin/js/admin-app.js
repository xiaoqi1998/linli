/* ==========================================================================
   邻里鲜生 · 运营后台应用逻辑
   ========================================================================== */
const Admin = (function () {
  let currentPage = 'dashboard';
  let dashboardDateRange = 'last7days';

  async function init() {
    // 登录 - always refresh token for demo reliability
    try {
      const res = await AdminAPI.loginGuest();
      AdminAPI.setToken(res.token);
    } catch (e) {
      console.error('登录失败:', e);
    }
    await go('dashboard');
  }

  async function go(page) {
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    const main = document.getElementById('main-content');
    main.innerHTML = '<div class="loading">加载中...</div>';

    try {
      let html = '';
      switch (page) {
        case 'dashboard': html = await renderDashboard(); break;
        case 'orders': html = await renderOrders(); break;
        case 'products': html = await renderProducts(); break;
        case 'leaders': html = await renderLeaders(); break;
        case 'coupons': html = await renderCoupons(); break;
        case 'riders': html = await renderRiders(); break;
        case 'inventory': html = await renderInventory(); break;
      }
      main.innerHTML = html;
    } catch (e) {
      main.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p><p style="margin-top:10px"><button class="btn btn-primary" onclick="Admin.go('${page}')">重试</button></p></div>`;
    }
  }

  /* ---- Dashboard ---- */
  async function renderDashboard() {
    const data = await AdminAPI.getOverview(dashboardDateRange);
    const s = data.summary;

    const maxGmv = Math.max(...data.trend.map(t => parseFloat(t.gmv)), 1);
    const dr = dashboardDateRange;

    return `
      <div class="page-header">
        <h1 class="page-title">数据看板</h1>
        <div class="page-actions">
          <select class="filter-select" onchange="Admin.reloadDashboard(this.value)">
            <option value="today" ${dr === 'today' ? 'selected' : ''}>今日</option>
            <option value="yesterday" ${dr === 'yesterday' ? 'selected' : ''}>昨日</option>
            <option value="last7days" ${dr === 'last7days' ? 'selected' : ''}>近7天</option>
          </select>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-label">总成交额 (GMV)</span>
          <span class="stat-value">¥${s.totalGmv}</span>
          <span class="stat-icon">💰</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">总订单数</span>
          <span class="stat-value">${s.totalOrders}</span>
          <span class="stat-icon">📦</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">客单价</span>
          <span class="stat-value">¥${s.avgOrderValue}</span>
          <span class="stat-icon">📊</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">下单用户数</span>
          <span class="stat-value">${s.totalUsers}</span>
          <span class="stat-icon">👥</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">新增用户</span>
          <span class="stat-value">${s.newUsers}</span>
          <span class="stat-icon">✨</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">近7天 GMV 趋势</span>
        </div>
        <div class="chart-container">
          ${data.trend.map(t => `
            <div class="bar-group">
              <div class="bar" style="height: ${(parseFloat(t.gmv) / maxGmv * 160)}px">
                <span class="bar-value">¥${parseFloat(t.gmv).toFixed(0)}</span>
              </div>
              <span class="bar-label">${t.date}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">品类销售排行</span>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>排名</th><th>品类</th><th>销量</th><th>销售额</th></tr></thead>
            <tbody>
              ${data.categorySales.length ? data.categorySales.map((c, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${c.icon || ''} ${c.name}</td>
                  <td>${c.cnt} 件</td>
                  <td>¥${parseFloat(c.amount).toFixed(2)}</td>
                </tr>
              `).join('') : '<tr><td colspan="4" style="text-align:center;color:#94a3b8">暂无数据</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function reloadDashboard(dateRange) {
    dashboardDateRange = dateRange || 'last7days';
    const main = document.getElementById('main-content');
    main.innerHTML = '<div class="loading">加载中...</div>';
    try {
      main.innerHTML = await renderDashboard();
    } catch (e) {
      main.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p><p style="margin-top:10px"><button class="btn btn-primary" onclick="Admin.reloadDashboard('${dashboardDateRange}')">重试</button></p></div>`;
    }
  }

  /* ---- Orders ---- */
  let orderFilter = { status: '', keyword: '' };

  async function renderOrders() {
    const params = { page: 1, pageSize: 50 };
    if (orderFilter.status) params.status = orderFilter.status;
    if (orderFilter.keyword) params.keyword = orderFilter.keyword;

    const data = await AdminAPI.getOrders(params);

    const statusOptions = [
      { v: '', l: '全部' }, { v: 10, l: '待付款' }, { v: 20, l: '待配送' },
      { v: 30, l: '配送中' }, { v: 40, l: '待确认' }, { v: 50, l: '已完成' }, { v: 99, l: '已取消' },
    ];

    return `
      <div class="page-header"><h1 class="page-title">订单管理</h1></div>
      <div class="filter-bar">
        <select class="filter-select" onchange="Admin.filterOrders('status', this.value)">
          ${statusOptions.map(o => `<option value="${o.v}" ${orderFilter.status == o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
        </select>
        <input class="filter-input" id="order-keyword-input" placeholder="搜索订单号/手机号" value="${orderFilter.keyword || ''}" onkeyup="if(event.key==='Enter')Admin.filterOrders('keyword',this.value)" />
        <button class="btn btn-primary btn-sm" onclick="Admin.filterOrders('keyword', document.getElementById('order-keyword-input').value)">搜索</button>
      </div>
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>订单号</th><th>用户</th><th>社区</th><th>商品</th><th>金额</th><th>状态</th><th>下单时间</th></tr></thead>
            <tbody>
              ${data.list.length ? data.list.map(o => `
                <tr>
                  <td style="font-family:monospace;font-size:12px">${o.order_no}</td>
                  <td>${o.nick_name || '-'}<br><span style="color:#94a3b8;font-size:12px">${o.phone || ''}</span></td>
                  <td>${o.community_name || '-'}</td>
                  <td>${(o.items || []).length} 件</td>
                  <td>¥${(o.pay_amount || 0).toFixed(2)}</td>
                  <td>${orderStatusBadge(o.status)}</td>
                  <td style="font-size:12px;color:#64748b">${o.created_at || ''}</td>
                </tr>
              `).join('') : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:40px">暂无订单</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function orderStatusBadge(status) {
    const map = { 10: ['待付款', 'badge-orange'], 20: ['待配送', 'badge-blue'], 30: ['配送中', 'badge-blue'], 40: ['待确认', 'badge-orange'], 50: ['已完成', 'badge-green'], 60: ['售后中', 'badge-red'], 70: ['已退款', 'badge-red'], 99: ['已取消', 'badge-gray'] };
    const [text, cls] = map[status] || ['未知', 'badge-gray'];
    return `<span class="badge ${cls}">${text}</span>`;
  }

  function filterOrders(key, val) {
    orderFilter[key] = val;
    go('orders');
  }

  /* ---- Products ---- */
  async function renderProducts() {
    const data = await AdminAPI.getProducts({ page: 1, pageSize: 50 });

    return `
      <div class="page-header">
        <h1 class="page-title">商品管理</h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="Admin.showProductModal()">+ 新增商品</button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>商品</th><th>分类</th><th>售价</th><th>市场价</th><th>佣金率</th><th>销量</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              ${data.list.length ? data.list.map(p => `
                <tr>
                  <td><div style="display:flex;align-items:center;gap:8px"><span class="table-row-img" style="background:#f0fdf4">${p.main_image ? `<img src="${p.main_image}" style="width:32px;height:32px;border-radius:6px;object-fit:cover" />` : '📦'}</span><span>${p.name}</span></div></td>
                  <td>${p.category_name || '-'}</td>
                  <td>¥${p.sale_price}</td>
                  <td style="color:#94a3b8;text-decoration:line-through">¥${p.market_price}</td>
                  <td>${p.commission_rate}%</td>
                  <td>${p.sales_count}</td>
                  <td>${p.status === 1 ? '<span class="badge badge-green">上架</span>' : '<span class="badge badge-gray">下架</span>'}</td>
                  <td>
                    <button class="btn btn-sm ${p.status === 1 ? 'btn-outline' : 'btn-primary'}" onclick="Admin.toggleProduct(${p.id}, ${p.status === 1 ? 2 : 1})">${p.status === 1 ? '下架' : '上架'}</button>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:40px">暂无商品</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function showProductModal() {
    document.getElementById('modal-container').innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">新增商品</h3>
          <div class="form-group"><label class="form-label">商品名称 *</label><input class="form-input" id="p-name" placeholder="如：有机小番茄" /></div>
          <div class="form-group"><label class="form-label">副标题</label><input class="form-input" id="p-subtitle" placeholder="如：酸甜适口" /></div>
          <div class="form-group"><label class="form-label">分类ID *</label><input class="form-input" id="p-categoryId" type="number" value="1" /></div>
          <div class="form-group"><label class="form-label">单位</label><input class="form-input" id="p-unit" placeholder="如：500g/盒" value="份" /></div>
          <div class="form-group"><label class="form-label">成本价</label><input class="form-input" id="p-costPrice" type="number" step="0.01" value="0" /></div>
          <div class="form-group"><label class="form-label">市场价(划线价)</label><input class="form-input" id="p-marketPrice" type="number" step="0.01" value="0" /></div>
          <div class="form-group"><label class="form-label">售价 *</label><input class="form-input" id="p-salePrice" type="number" step="0.01" placeholder="如：9.90" /></div>
          <div class="form-group"><label class="form-label">佣金率(%)</label><input class="form-input" id="p-commissionRate" type="number" step="0.01" value="8.00" /></div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="Admin.submitProduct()">创建</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitProduct() {
    const data = {
      name: document.getElementById('p-name').value,
      subtitle: document.getElementById('p-subtitle').value,
      categoryId: parseInt(document.getElementById('p-categoryId').value),
      unit: document.getElementById('p-unit').value,
      costPrice: parseFloat(document.getElementById('p-costPrice').value),
      marketPrice: parseFloat(document.getElementById('p-marketPrice').value),
      salePrice: parseFloat(document.getElementById('p-salePrice').value),
      commissionRate: parseFloat(document.getElementById('p-commissionRate').value),
    };

    if (!data.name || !data.salePrice) {
      toast('商品名称和售价不能为空');
      return;
    }

    try {
      await AdminAPI.createProduct(data);
      toast('商品创建成功');
      closeModal();
      go('products');
    } catch (e) {
      toast('创建失败: ' + e.message);
    }
  }

  async function toggleProduct(id, status) {
    try {
      await AdminAPI.updateProductStatus(id, status);
      toast(status === 1 ? '已上架' : '已下架');
      go('products');
    } catch (e) { toast('操作失败'); }
  }

  function closeModal() {
    document.getElementById('modal-container').innerHTML = '';
  }

  /* ---- Leaders ---- */
  async function renderLeaders() {
    const data = await AdminAPI.getLeaders();

    return `
      <div class="page-header"><h1 class="page-title">团长管理</h1></div>
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>团长</th><th>社区</th><th>手机号</th><th>累计佣金</th><th>可提现</th><th>订单数</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              ${data.list.length ? data.list.map(l => `
                <tr>
                  <td>${l.nick_name || l.name || '-'}</td>
                  <td>${l.community_name || '-'}</td>
                  <td>${l.phone || '-'}</td>
                  <td>¥${(l.total_commission || 0).toFixed(2)}</td>
                  <td>¥${(l.withdrawable_commission || 0).toFixed(2)}</td>
                  <td>${l.order_count || 0}</td>
                  <td>${l.status === 1 ? '<span class="badge badge-green">正常</span>' : l.status === 2 ? '<span class="badge badge-orange">暂停</span>' : '<span class="badge badge-red">清退</span>'}</td>
                  <td>
                    ${l.status === 1
                      ? `<button class="btn btn-sm btn-outline" onclick="Admin.toggleLeader(${l.id}, 2)">暂停</button>`
                      : `<button class="btn btn-sm btn-primary" onclick="Admin.toggleLeader(${l.id}, 1)">启用</button>`
                    }
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:40px">暂无团长</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function toggleLeader(id, status) {
    try {
      await AdminAPI.updateLeaderStatus(id, status);
      toast('状态已更新');
      go('leaders');
    } catch (e) { toast('操作失败'); }
  }

  /* ---- Coupons ---- */
  async function renderCoupons() {
    const data = await AdminAPI.getCoupons();

    return `
      <div class="page-header">
        <h1 class="page-title">优惠券管理</h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="Admin.showCouponModal()">+ 新建优惠券</button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>名称</th><th>类型</th><th>面额</th><th>门槛</th><th>有效期(天)</th><th>发放总量</th><th>每人限领</th><th>状态</th></tr></thead>
            <tbody>
              ${data.list.length ? data.list.map(c => `
                <tr>
                  <td>${c.name}</td>
                  <td>${c.type === 1 ? '满减' : c.type === 2 ? '折扣' : '免配送费'}</td>
                  <td>${c.type === 2 ? (c.face_value * 10) + '折' : '¥' + c.face_value}</td>
                  <td>满¥${c.min_order_amount}</td>
                  <td>${c.valid_days || '-'}</td>
                  <td>${c.total_count || '不限'}</td>
                  <td>${c.per_user_limit || '-'}</td>
                  <td>${c.status === 1 ? '<span class="badge badge-green">有效</span>' : '<span class="badge badge-gray">已下架</span>'}</td>
                </tr>
              `).join('') : '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:40px">暂无优惠券</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function showCouponModal() {
    document.getElementById('modal-container').innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">新建优惠券</h3>
          <div class="form-group"><label class="form-label">名称 *</label><input class="form-input" id="c-name" placeholder="如：满30减5" /></div>
          <div class="form-group"><label class="form-label">类型</label><select class="form-input" id="c-type"><option value="1">满减</option><option value="2">折扣</option><option value="3">免配送费</option></select></div>
          <div class="form-group"><label class="form-label">面额(满减填金额, 折扣填0.95)</label><input class="form-input" id="c-faceValue" type="number" step="0.01" value="5.00" /></div>
          <div class="form-group"><label class="form-label">使用门槛(元)</label><input class="form-input" id="c-minOrderAmount" type="number" step="0.01" value="30.00" /></div>
          <div class="form-group"><label class="form-label">有效期(天)</label><input class="form-input" id="c-validDays" type="number" value="30" /></div>
          <div class="form-group"><label class="form-label">发放总量(0=不限)</label><input class="form-input" id="c-totalCount" type="number" value="100" /></div>
          <div class="form-group"><label class="form-label">每人限领</label><input class="form-input" id="c-perUserLimit" type="number" value="1" /></div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="Admin.submitCoupon()">创建</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitCoupon() {
    const data = {
      name: document.getElementById('c-name').value,
      type: parseInt(document.getElementById('c-type').value),
      faceValue: parseFloat(document.getElementById('c-faceValue').value),
      minOrderAmount: parseFloat(document.getElementById('c-minOrderAmount').value),
      validDays: parseInt(document.getElementById('c-validDays').value),
      totalCount: parseInt(document.getElementById('c-totalCount').value),
      perUserLimit: parseInt(document.getElementById('c-perUserLimit').value),
    };
    try {
      await AdminAPI.createCoupon(data);
      toast('优惠券创建成功');
      closeModal();
      go('coupons');
    } catch (e) { toast('创建失败'); }
  }

  /* ---- Rider Management ---- */
  async function renderRiders() {
    const data = await AdminAPI.getRiders({ pageSize: 50 });
    const riders = data.list || [];
    let warehouses = [];
    try {
      const whData = await AdminAPI.getWarehouses();
      warehouses = whData.list || [];
    } catch (e) {}

    return `
      <div class="page-header">
        <h1 class="page-title">骑手管理</h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="Admin.showRiderModal()">+ 添加骑手</button>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat-card"><span class="stat-label">总骑手数</span><span class="stat-value">${data.total || 0}</span></div>
        <div class="stat-card"><span class="stat-label">在职骑手</span><span class="stat-value green">${riders.filter(r => r.status === 1).length}</span></div>
        <div class="stat-card"><span class="stat-label">配送中</span><span class="stat-value orange">${riders.reduce((s, r) => s + (r.currentOrders || 0), 0)}</span></div>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>ID</th><th>姓名</th><th>电话</th><th>所属仓库</th><th>当前订单</th><th>总订单</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${riders.length ? riders.map(r => `
              <tr>
                <td>${r.id}</td>
                <td>${r.name}</td>
                <td>${r.phone || '-'}</td>
                <td>${r.warehouseName || '-'}</td>
                <td>${r.currentOrders || 0}</td>
                <td>${r.totalOrders || 0}</td>
                <td><span class="badge badge-${r.status === 1 ? 'success' : 'danger'}">${r.status === 1 ? '在职' : '离线'}</span></td>
                <td>
                  <button class="btn btn-sm ${r.status === 1 ? 'btn-outline' : 'btn-primary'}" onclick="Admin.toggleRider(${r.id}, ${r.status === 1 ? 0 : 1})">${r.status === 1 ? '下线' : '上线'}</button>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:#999;">暂无骑手数据</td></tr>'}
          </tbody>
        </table>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function showRiderModal() {
    const container = document.getElementById('modal-container');
    if (!container) return;
    AdminAPI.getWarehouses().then(d => {
      const warehouses = d.list || [];
      container.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
          <div class="modal">
            <h3 class="modal-title">添加骑手</h3>
            <div class="form-group"><label class="form-label">姓名 *</label><input class="form-input" id="r-name" placeholder="骑手姓名" /></div>
            <div class="form-group"><label class="form-label">电话</label><input class="form-input" id="r-phone" type="tel" placeholder="手机号" /></div>
            <div class="form-group"><label class="form-label">所属前置仓 *</label><select class="form-input" id="r-warehouse">${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}</select></div>
            <div class="modal-footer">
              <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
              <button class="btn btn-primary" onclick="Admin.submitRider()">添加</button>
            </div>
          </div>
        </div>
      `;
    }).catch(e => toast('获取仓库列表失败'));
  }

  async function submitRider() {
    const name = document.getElementById('r-name').value.trim();
    const phone = document.getElementById('r-phone').value.trim();
    const warehouseId = parseInt(document.getElementById('r-warehouse').value);
    if (!name) { toast('请输入姓名'); return; }
    try {
      await AdminAPI.createRider({ name, phone, warehouseId });
      toast('骑手添加成功');
      closeModal();
      go('riders');
    } catch (e) { toast(e.message || '添加失败'); }
  }

  async function toggleRider(id, status) {
    try {
      await AdminAPI.updateRiderStatus(id, status);
      toast('状态已更新');
      go('riders');
    } catch (e) { toast('操作失败'); }
  }

  /* ---- Inventory Management ---- */
  let inventoryWarehouseFilter = '';

  async function renderInventory() {
    const params = { pageSize: 50 };
    if (inventoryWarehouseFilter) params.warehouseId = inventoryWarehouseFilter;
    const data = await AdminAPI.getInventory(params);
    const items = data.list || [];
    let warehouses = [];
    try {
      const whData = await AdminAPI.getWarehouses();
      warehouses = whData.list || [];
    } catch (e) {}

    const lowStockCount = items.filter(i => i.isLowStock).length;

    return `
      <div class="page-header">
        <h1 class="page-title">库存管理</h1>
        <div class="page-actions">
          <select class="filter-select" onchange="Admin.filterInventory(this.value)">
            <option value="">全部仓库</option>
            ${warehouses.map(w => `<option value="${w.id}" ${inventoryWarehouseFilter == w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat-card"><span class="stat-label">库存记录</span><span class="stat-value">${data.total || 0}</span></div>
        <div class="stat-card"><span class="stat-label">库存预警</span><span class="stat-value ${lowStockCount > 0 ? 'orange' : 'green'}">${lowStockCount}</span></div>
        <div class="stat-card"><span class="stat-label">锁定库存</span><span class="stat-value">${items.reduce((s, i) => s + (i.lockedStock || 0), 0)}</span></div>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>商品</th><th>分类</th><th>仓库</th><th>可售库存</th><th>锁定库存</th><th>预警阈值</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${items.length ? items.map(i => `
              <tr ${i.isLowStock ? 'class="table-row-warning"' : ''}>
                <td>${i.skuName}</td>
                <td>${i.categoryName || '-'}</td>
                <td>${i.warehouseName}</td>
                <td><strong>${i.availableStock}</strong></td>
                <td>${i.lockedStock}</td>
                <td>${i.warningThreshold}</td>
                <td>${i.isLowStock ? '<span class="badge badge-warning">库存不足</span>' : '<span class="badge badge-success">正常</span>'}</td>
                <td><button class="btn btn-sm btn-outline" onclick="Admin.showInventoryModal(${i.id}, '${i.skuName.replace(/'/g, '')}', ${i.availableStock}, ${i.warningThreshold})">编辑</button></td>
              </tr>
            `).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:#999;">暂无库存数据</td></tr>'}
          </tbody>
        </table>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function filterInventory(warehouseId) {
    inventoryWarehouseFilter = warehouseId;
    go('inventory');
  }

  function showInventoryModal(id, name, stock, threshold) {
    const container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">编辑库存</h3>
          <p class="form-label" style="margin-bottom:16px">商品：${name}</p>
          <div class="form-group"><label class="form-label">可售库存</label><input class="form-input" id="inv-stock" type="number" min="0" value="${stock}" /></div>
          <div class="form-group"><label class="form-label">预警阈值</label><input class="form-input" id="inv-threshold" type="number" min="0" value="${threshold}" /></div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="Admin.submitInventory(${id})">保存</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitInventory(id) {
    const stock = parseInt(document.getElementById('inv-stock').value);
    const threshold = parseInt(document.getElementById('inv-threshold').value);
    try {
      await AdminAPI.updateInventory(id, { availableStock: stock, warningThreshold: threshold });
      toast('库存已更新');
      closeModal();
      go('inventory');
    } catch (e) { toast(e.message || '更新失败'); }
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

  return { init, go, toast, filterOrders, reloadDashboard, showProductModal, submitProduct, toggleProduct, closeModal, showCouponModal, submitCoupon, toggleLeader, showRiderModal, submitRider, toggleRider, filterInventory, showInventoryModal, submitInventory };
})();

document.addEventListener('DOMContentLoaded', () => Admin.init());
