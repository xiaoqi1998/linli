/* ==========================================================================
   邻里鲜生 · 运营后台应用逻辑
   ========================================================================== */
const Admin = (function () {
  let currentPage = 'dashboard';
  let dashboardDateRange = 'last7days';

  async function init() {
    // 已登录管理员则保留 token，否则 demo 模式游客登录
    const adminInfo = AdminAPI.getAdminInfo();
    if (!adminInfo) {
      try {
        const res = await AdminAPI.loginGuest();
        AdminAPI.setToken(res.token);
      } catch (e) {
        console.error('登录失败:', e);
      }
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
        case 'admin-login': html = await renderLogin(); break;
        case 'banners': html = await renderBanners(); break;
        case 'member-rules': html = await renderMemberRules(); break;
        case 'community-sku': html = await renderCommunitySku(); break;
        case 'leader-applications': html = await renderLeaderApplications(); break;
        case 'finance': html = await renderFinance(); break;
        case 'user-reports': html = await renderUserReports(); break;
        case 'logs': html = await renderLogs(); break;
        case 'product-import-export': html = await renderProductImportExport(); break;
        case 'rider-performance': html = await renderRiderPerformance(); break;
        case 'order-dispatch': html = await renderOrderDispatch(); break;
        case 'rbac': html = await renderRbac(); break;
        case 'inventory-warnings': html = await renderInventoryWarnings(); break;
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
                  <button class="btn btn-sm btn-outline" onclick="Admin.viewRiderPerformance(${r.id})">查看绩效</button>
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

  /* ---- Admin Login ---- */
  async function renderLogin() {
    const adminInfo = AdminAPI.getAdminInfo();
    if (adminInfo) {
      const perms = adminInfo.permissions || [];
      return `
        <div class="page-header"><h1 class="page-title">管理员信息</h1></div>
        <div class="card">
          <div class="card-header"><span class="card-title">当前登录管理员</span></div>
          <div style="padding:10px 0">
            <p style="margin-bottom:10px"><strong>用户名：</strong>${adminInfo.username || '-'}</p>
            <p style="margin-bottom:10px"><strong>姓名：</strong>${adminInfo.realName || '-'}</p>
            <p style="margin-bottom:10px"><strong>角色：</strong><span class="badge badge-green">${adminInfo.roleName || '-'}</span></p>
            <p style="margin-bottom:6px"><strong>权限：</strong></p>
            <div>${perms.length ? perms.map(p => `<span class="badge badge-blue" style="margin:2px">${p}</span>`).join('') : '<span class="badge badge-gray">无</span>'}</div>
          </div>
          <div style="margin-top:20px">
            <button class="btn btn-danger" onclick="Admin.adminLogout()">退出管理员登录</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="page-header"><h1 class="page-title">管理员登录</h1></div>
      <div class="card" style="max-width:420px;margin:0 auto">
        <div class="card-header"><span class="card-title">账号登录</span></div>
        <div class="form-group"><label class="form-label">用户名</label><input class="form-input" id="login-username" placeholder="请输入用户名" /></div>
        <div class="form-group"><label class="form-label">密码</label><input class="form-input" id="login-password" type="password" placeholder="请输入密码" onkeyup="if(event.key==='Enter')Admin.submitAdminLogin()" /></div>
        <div class="modal-footer"><button class="btn btn-primary" onclick="Admin.submitAdminLogin()">登录</button></div>
        <p style="color:#94a3b8;font-size:12px;margin-top:10px">提示：Demo 模式下无需登录也可使用后台功能。</p>
      </div>
    `;
  }

  async function submitAdminLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!username || !password) { toast('请输入用户名和密码'); return; }
    try {
      const res = await AdminAPI.adminLogin(username, password);
      AdminAPI.setToken(res.token);
      AdminAPI.setAdminInfo({
        id: res.adminId,
        username: res.username,
        realName: res.realName,
        roleId: res.roleId,
        roleName: res.roleName,
        permissions: res.permissions || [],
      });
      toast('登录成功');
      go('admin-login');
    } catch (e) { toast('登录失败: ' + e.message); }
  }

  async function adminLogout() {
    AdminAPI.clearAdmin();
    try {
      const res = await AdminAPI.loginGuest();
      AdminAPI.setToken(res.token);
    } catch (e) {}
    toast('已退出管理员登录');
    go('dashboard');
  }

  /* ---- Banner Management ---- */
  let bannerCache = [];

  async function renderBanners() {
    const data = await AdminAPI.getBanners();
    bannerCache = data.list || [];
    return `
      <div class="page-header">
        <h1 class="page-title">Banner 管理</h1>
        <div class="page-actions"><button class="btn btn-primary" onclick="Admin.showBannerModal()">+ 新增 Banner</button></div>
      </div>
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>ID</th><th>标题</th><th>副标题</th><th>背景</th><th>跳转类型</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              ${bannerCache.length ? bannerCache.map(b => `
                <tr>
                  <td>${b.id}</td>
                  <td>${b.title || '-'}</td>
                  <td style="color:#64748b">${b.subtitle || '-'}</td>
                  <td>${b.bg || '-'}</td>
                  <td>${b.link_type || '-'}</td>
                  <td>${b.sort_order || 0}</td>
                  <td>${b.status === 1 ? '<span class="badge badge-green">上线</span>' : '<span class="badge badge-gray">下线</span>'}</td>
                  <td>
                    <button class="btn btn-sm btn-outline" onclick="Admin.showBannerModal(${b.id})">编辑</button>
                    <button class="btn btn-sm ${b.status === 1 ? 'btn-outline' : 'btn-primary'}" onclick="Admin.toggleBannerStatus(${b.id}, ${b.status === 1 ? 0 : 1})">${b.status === 1 ? '下线' : '上线'}</button>
                    <button class="btn btn-sm btn-danger" onclick="Admin.deleteBanner(${b.id})">删除</button>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:40px">暂无 Banner</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function showBannerModal(id) {
    const container = document.getElementById('modal-container');
    if (!container) return;
    const b = id ? bannerCache.find(x => x.id === id) : null;
    const isEdit = !!b;
    container.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">${isEdit ? '编辑 Banner' : '新增 Banner'}</h3>
          <div class="form-group"><label class="form-label">标题 *</label><input class="form-input" id="b-title" value="${b ? (b.title || '') : ''}" placeholder="如：新鲜蔬果专场" /></div>
          <div class="form-group"><label class="form-label">副标题</label><input class="form-input" id="b-subtitle" value="${b ? (b.subtitle || '') : ''}" placeholder="如：产地直发" /></div>
          <div class="form-group"><label class="form-label">图片 URL</label><input class="form-input" id="b-image" value="${b ? (b.image || '') : ''}" placeholder="https://..." /></div>
          <div class="form-group"><label class="form-label">背景 CSS 类</label><input class="form-input" id="b-bg" value="${b ? (b.bg || 'banner-fresh') : 'banner-fresh'}" placeholder="如：banner-fresh" /></div>
          <div class="form-group"><label class="form-label">跳转类型</label><select class="form-input" id="b-linkType"><option value="" ${b && !b.link_type ? 'selected' : ''}>无跳转</option><option value="product" ${b && b.link_type === 'product' ? 'selected' : ''}>商品</option><option value="category" ${b && b.link_type === 'category' ? 'selected' : ''}>分类</option><option value="page" ${b && b.link_type === 'page' ? 'selected' : ''}>页面</option><option value="url" ${b && b.link_type === 'url' ? 'selected' : ''}>外部链接</option></select></div>
          <div class="form-group"><label class="form-label">跳转值</label><input class="form-input" id="b-linkValue" value="${b ? (b.link_value || '') : ''}" placeholder="商品ID/分类ID/页面路径/URL" /></div>
          <div class="form-group"><label class="form-label">排序</label><input class="form-input" id="b-sortOrder" type="number" value="${b ? (b.sort_order || 0) : 0}" /></div>
          <div class="form-group"><label class="form-label">生效开始时间</label><input class="form-input" id="b-validStart" type="datetime-local" value="${b && b.valid_start ? b.valid_start.substring(0, 16) : ''}" /></div>
          <div class="form-group"><label class="form-label">生效结束时间</label><input class="form-input" id="b-validEnd" type="datetime-local" value="${b && b.valid_end ? b.valid_end.substring(0, 16) : ''}" /></div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="Admin.submitBanner(${isEdit ? b.id : 'null'})">${isEdit ? '保存' : '创建'}</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitBanner(id) {
    const title = document.getElementById('b-title').value;
    const subtitle = document.getElementById('b-subtitle').value;
    const image = document.getElementById('b-image').value;
    const bg = document.getElementById('b-bg').value;
    const linkType = document.getElementById('b-linkType').value || null;
    const linkValue = document.getElementById('b-linkValue').value || null;
    const sortOrder = parseInt(document.getElementById('b-sortOrder').value) || 0;
    const validStart = document.getElementById('b-validStart').value || null;
    const validEnd = document.getElementById('b-validEnd').value || null;
    if (!title) { toast('标题不能为空'); return; }
    try {
      if (id) {
        await AdminAPI.updateBanner(id, { title, subtitle, image, bg, link_type: linkType, link_value: linkValue, sort_order: sortOrder, valid_start: validStart, valid_end: validEnd });
        toast('Banner 已更新');
      } else {
        await AdminAPI.createBanner({ title, subtitle, image, bg, linkType, linkValue, sortOrder, validStart, validEnd });
        toast('Banner 已创建');
      }
      closeModal();
      go('banners');
    } catch (e) { toast('操作失败: ' + e.message); }
  }

  async function toggleBannerStatus(id, status) {
    try {
      await AdminAPI.updateBannerStatus(id, status);
      toast(status === 1 ? '已上线' : '已下线');
      go('banners');
    } catch (e) { toast('操作失败'); }
  }

  async function deleteBanner(id) {
    if (!confirm('确认删除此 Banner？')) return;
    try {
      await AdminAPI.deleteBanner(id);
      toast('已删除');
      go('banners');
    } catch (e) { toast('删除失败'); }
  }

  /* ---- Member Rules ---- */
  let memberRuleCache = [];

  async function renderMemberRules() {
    const data = await AdminAPI.getMemberRules();
    memberRuleCache = data.list || [];
    return `
      <div class="page-header"><h1 class="page-title">会员规则</h1></div>
      <div class="card">
        <div class="card-header"><span class="card-title">会员等级配置</span></div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>等级</th><th>名称</th><th>最低消费(元)</th><th>最低订单数</th><th>折扣率</th><th>免配送费次数</th><th>优先支持</th><th>操作</th></tr></thead>
            <tbody>
              ${memberRuleCache.length ? memberRuleCache.map(r => `
                <tr>
                  <td>${r.level}</td>
                  <td>${r.name}</td>
                  <td>¥${r.min_consume}</td>
                  <td>${r.min_orders}</td>
                  <td>${r.discount_rate}折</td>
                  <td>${r.free_delivery_count}</td>
                  <td>${r.priority_support ? '<span class="badge badge-green">是</span>' : '<span class="badge badge-gray">否</span>'}</td>
                  <td><button class="btn btn-sm btn-outline" onclick="Admin.showMemberRuleModal(${r.id})">编辑</button></td>
                </tr>
              `).join('') : '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:40px">暂无数据</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function showMemberRuleModal(id) {
    const r = memberRuleCache.find(x => x.id === id);
    if (!r) return;
    const container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">编辑会员规则 - ${r.name}</h3>
          <div class="form-group"><label class="form-label">名称</label><input class="form-input" id="mr-name" value="${r.name || ''}" /></div>
          <div class="form-group"><label class="form-label">最低消费(元)</label><input class="form-input" id="mr-minConsume" type="number" step="0.01" value="${r.min_consume || 0}" /></div>
          <div class="form-group"><label class="form-label">最低订单数</label><input class="form-input" id="mr-minOrders" type="number" value="${r.min_orders || 0}" /></div>
          <div class="form-group"><label class="form-label">折扣率(如 0.95 = 95折)</label><input class="form-input" id="mr-discountRate" type="number" step="0.01" value="${r.discount_rate || 1}" /></div>
          <div class="form-group"><label class="form-label">免配送费次数</label><input class="form-input" id="mr-freeDeliveryCount" type="number" value="${r.free_delivery_count || 0}" /></div>
          <div class="form-group"><label class="form-label">优先支持</label><select class="form-input" id="mr-prioritySupport"><option value="0" ${!r.priority_support ? 'selected' : ''}>否</option><option value="1" ${r.priority_support ? 'selected' : ''}>是</option></select></div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="Admin.submitMemberRule(${id})">保存</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitMemberRule(id) {
    const data = {
      name: document.getElementById('mr-name').value,
      minConsume: parseFloat(document.getElementById('mr-minConsume').value),
      minOrders: parseInt(document.getElementById('mr-minOrders').value),
      discountRate: parseFloat(document.getElementById('mr-discountRate').value),
      freeDeliveryCount: parseInt(document.getElementById('mr-freeDeliveryCount').value),
      prioritySupport: parseInt(document.getElementById('mr-prioritySupport').value) === 1,
    };
    try {
      await AdminAPI.updateMemberRule(id, data);
      toast('会员规则已更新');
      closeModal();
      go('member-rules');
    } catch (e) { toast('更新失败: ' + e.message); }
  }

  /* ---- Community SKU (千区千面) ---- */
  let communitySkuFilter = '';
  let communityCache = [];
  let communitySkuCache = [];

  async function renderCommunitySku() {
    if (!communityCache.length) {
      try {
        const cData = await AdminAPI.getCommunities();
        communityCache = cData.list || [];
      } catch (e) {}
    }
    if (!communitySkuFilter && communityCache.length) {
      communitySkuFilter = communityCache[0].id;
    }
    let skuList = [];
    if (communitySkuFilter) {
      try {
        const data = await AdminAPI.getCommunitySku(communitySkuFilter);
        skuList = data.list || [];
        communitySkuCache = skuList;
      } catch (e) {}
    }
    const currentCommunity = communityCache.find(c => c.id == communitySkuFilter);
    return `
      <div class="page-header">
        <h1 class="page-title">千区千面选品</h1>
        <div class="page-actions">
          <select class="filter-select" onchange="Admin.filterCommunitySku(this.value)">
            ${communityCache.map(c => `<option value="${c.id}" ${communitySkuFilter == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">已配置商品 (社区: ${currentCommunity ? currentCommunity.name : '-'})</span>
          <div>
            <button class="btn btn-sm btn-primary" onclick="Admin.showCommunitySkuModal()">+ 添加商品</button>
            <button class="btn btn-sm btn-outline" onclick="Admin.showBatchSkuModal()">批量导入</button>
          </div>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>ID</th><th>商品名称</th><th>单位</th><th>售价</th><th>推荐</th><th>热销</th><th>排序</th><th>操作</th></tr></thead>
            <tbody>
              ${skuList.length ? skuList.map(s => `
                <tr>
                  <td>${s.id}</td>
                  <td>${s.sku_name || '-'}</td>
                  <td>${s.unit || '-'}</td>
                  <td>¥${s.sale_price || 0}</td>
                  <td>${s.is_recommend ? '<span class="badge badge-green">是</span>' : '<span class="badge badge-gray">否</span>'}</td>
                  <td>${s.is_hot ? '<span class="badge badge-red">是</span>' : '<span class="badge badge-gray">否</span>'}</td>
                  <td>${s.sort_order || 0}</td>
                  <td><button class="btn btn-sm btn-danger" onclick="Admin.removeCommunitySku(${s.id})">移除</button></td>
                </tr>
              `).join('') : '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:40px">暂无配置</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function filterCommunitySku(communityId) {
    communitySkuFilter = communityId;
    go('community-sku');
  }

  function showCommunitySkuModal() {
    const container = document.getElementById('modal-container');
    if (!container) return;
    AdminAPI.getProducts({ pageSize: 100 }).then(d => {
      const products = (d.list || []).filter(p => !communitySkuCache.find(cs => cs.sku_id === p.id));
      container.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
          <div class="modal">
            <h3 class="modal-title">添加商品到社区</h3>
            <div class="form-group"><label class="form-label">选择商品</label><select class="form-input" id="cs-skuId">${products.length ? products.map(p => `<option value="${p.id}">${p.name} (¥${p.sale_price})</option>`).join('') : '<option value="">暂无可选商品</option>'}</select></div>
            <div class="form-group"><label class="form-label">推荐</label><select class="form-input" id="cs-isRecommend"><option value="0">否</option><option value="1">是</option></select></div>
            <div class="form-group"><label class="form-label">热销</label><select class="form-input" id="cs-isHot"><option value="0">否</option><option value="1">是</option></select></div>
            <div class="form-group"><label class="form-label">排序</label><input class="form-input" id="cs-sortOrder" type="number" value="0" /></div>
            <div class="modal-footer">
              <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
              <button class="btn btn-primary" onclick="Admin.submitCommunitySku()">添加</button>
            </div>
          </div>
        </div>
      `;
    }).catch(e => toast('获取商品列表失败'));
  }

  async function submitCommunitySku() {
    const skuId = parseInt(document.getElementById('cs-skuId').value);
    if (!skuId) { toast('请选择商品'); return; }
    const data = {
      communityId: parseInt(communitySkuFilter),
      skuId,
      isRecommend: parseInt(document.getElementById('cs-isRecommend').value) === 1,
      isHot: parseInt(document.getElementById('cs-isHot').value) === 1,
      sortOrder: parseInt(document.getElementById('cs-sortOrder').value) || 0,
    };
    try {
      await AdminAPI.addCommunitySku(data);
      toast('已添加');
      closeModal();
      go('community-sku');
    } catch (e) { toast('添加失败: ' + e.message); }
  }

  async function removeCommunitySku(id) {
    if (!confirm('确认从社区移除该商品？')) return;
    try {
      await AdminAPI.deleteCommunitySku(id);
      toast('已移除');
      go('community-sku');
    } catch (e) { toast('操作失败'); }
  }

  function showBatchSkuModal() {
    const container = document.getElementById('modal-container');
    if (!container) return;
    AdminAPI.getProducts({ pageSize: 200 }).then(d => {
      const products = d.list || [];
      container.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
          <div class="modal">
            <h3 class="modal-title">批量导入商品到社区</h3>
            <p style="color:#64748b;margin-bottom:10px">勾选要批量添加的商品：</p>
            <div style="max-height:300px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;padding:10px">
              ${products.length ? products.map(p => `<label style="display:block;padding:4px 0"><input type="checkbox" class="batch-sku-check" value="${p.id}" /> ${p.name} (¥${p.sale_price})</label>`).join('') : '<p style="color:#94a3b8">暂无商品</p>'}
            </div>
            <div class="modal-footer">
              <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
              <button class="btn btn-primary" onclick="Admin.submitBatchSku()">批量添加</button>
            </div>
          </div>
        </div>
      `;
    }).catch(e => toast('获取商品列表失败'));
  }

  async function submitBatchSku() {
    const checked = document.querySelectorAll('.batch-sku-check:checked');
    const skuIds = Array.from(checked).map(c => parseInt(c.value));
    if (!skuIds.length) { toast('请至少选择一个商品'); return; }
    try {
      const res = await AdminAPI.batchAddCommunitySku({ communityId: parseInt(communitySkuFilter), skuIds });
      toast('批量添加成功，新增 ' + res.added + ' 个');
      closeModal();
      go('community-sku');
    } catch (e) { toast('批量添加失败: ' + e.message); }
  }

  /* ---- Leader Applications ---- */
  let leaderAppFilter = '';

  async function renderLeaderApplications() {
    const data = await AdminAPI.getLeaderApplications(leaderAppFilter);
    const list = data.list || [];
    if (!communityCache.length) {
      try {
        const cData = await AdminAPI.getCommunities();
        communityCache = cData.list || [];
      } catch (e) {}
    }
    const statusOptions = [
      { v: '', l: '全部' }, { v: 0, l: '待审核' }, { v: 1, l: '已通过' }, { v: 2, l: '已驳回' },
    ];
    return `
      <div class="page-header">
        <h1 class="page-title">团长招募</h1>
        <div class="page-actions">
          <select class="filter-select" onchange="Admin.filterLeaderApp(this.value)">
            ${statusOptions.map(o => `<option value="${o.v}" ${leaderAppFilter === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>ID</th><th>申请人</th><th>电话</th><th>申请社区</th><th>状态</th><th>申请时间</th><th>操作</th></tr></thead>
            <tbody>
              ${list.length ? list.map(a => `
                <tr>
                  <td>${a.id}</td>
                  <td>${a.name || '-'}</td>
                  <td>${a.phone || '-'}</td>
                  <td>${a.community_name || '-'}</td>
                  <td>${a.status === 0 ? '<span class="badge badge-orange">待审核</span>' : a.status === 1 ? '<span class="badge badge-green">已通过</span>' : '<span class="badge badge-red">已驳回</span>'}</td>
                  <td style="font-size:12px;color:#64748b">${a.created_at || ''}</td>
                  <td>
                    ${a.status === 0 ? `
                      <button class="btn btn-sm btn-primary" onclick="Admin.showApproveModal(${a.id})">通过</button>
                      <button class="btn btn-sm btn-danger" onclick="Admin.showRejectModal(${a.id})">驳回</button>
                    ` : '<span style="color:#94a3b8">已处理</span>'}
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:40px">暂无申请</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function filterLeaderApp(status) {
    leaderAppFilter = status;
    go('leader-applications');
  }

  function showApproveModal(id) {
    const container = document.getElementById('modal-container');
    if (!container) return;
    const communities = communityCache || [];
    container.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">通过团长申请</h3>
          <div class="form-group"><label class="form-label">分配社区</label><select class="form-input" id="ap-communityId">${communities.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
          <p style="color:#94a3b8;font-size:12px">如不选择，将使用申请时填写的社区</p>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="Admin.submitApprove(${id})">确认通过</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitApprove(id) {
    const communityId = parseInt(document.getElementById('ap-communityId').value);
    try {
      await AdminAPI.approveLeaderApp(id, { communityId });
      toast('已通过审核');
      closeModal();
      go('leader-applications');
    } catch (e) { toast('操作失败: ' + e.message); }
  }

  function showRejectModal(id) {
    const container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">驳回团长申请</h3>
          <div class="form-group"><label class="form-label">驳回原因</label><textarea class="form-input" id="rj-reason" rows="3" placeholder="请输入驳回原因"></textarea></div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-danger" onclick="Admin.submitReject(${id})">确认驳回</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitReject(id) {
    const reason = document.getElementById('rj-reason').value;
    try {
      await AdminAPI.rejectLeaderApp(id, { rejectReason: reason });
      toast('已驳回');
      closeModal();
      go('leader-applications');
    } catch (e) { toast('操作失败: ' + e.message); }
  }

  /* ---- Finance ---- */
  let financeDateRange = 'today';
  let financeTypeFilter = '';

  async function renderFinance() {
    const [summary, records] = await Promise.all([
      AdminAPI.getFinanceSummary(financeDateRange),
      AdminAPI.getFinanceRecords(financeTypeFilter, 1),
    ]);
    const recordList = records.list || [];
    const typeOptions = [
      { v: '', l: '全部' },
      { v: 'order_income', l: '订单收入' },
      { v: 'commission', l: '佣金' },
      { v: 'refund', l: '退款' },
      { v: 'platform_income', l: '平台收入' },
      { v: 'withdrawal', l: '提现' },
    ];
    return `
      <div class="page-header">
        <h1 class="page-title">资金对账</h1>
        <div class="page-actions">
          <select class="filter-select" onchange="Admin.filterFinanceDateRange(this.value)">
            <option value="today" ${financeDateRange === 'today' ? 'selected' : ''}>今日</option>
            <option value="yesterday" ${financeDateRange === 'yesterday' ? 'selected' : ''}>昨日</option>
            <option value="last7days" ${financeDateRange === 'last7days' ? 'selected' : ''}>近7天</option>
          </select>
          <button class="btn btn-primary" onclick="Admin.doReconcile()">手动对账</button>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-card"><span class="stat-label">总收入</span><span class="stat-value green">¥${summary.totalIncome}</span></div>
        <div class="stat-card"><span class="stat-label">总支出</span><span class="stat-value red">¥${summary.totalOutcome}</span></div>
        <div class="stat-card"><span class="stat-label">净收入</span><span class="stat-value">¥${summary.netIncome}</span></div>
        <div class="stat-card"><span class="stat-label">记录数</span><span class="stat-value">${summary.totalRecords}</span></div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">资金流水</span>
          <select class="filter-select" onchange="Admin.filterFinanceType(this.value)">
            ${typeOptions.map(o => `<option value="${o.v}" ${financeTypeFilter === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
          </select>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>ID</th><th>类型</th><th>方向</th><th>金额</th><th>关联订单</th><th>时间</th></tr></thead>
            <tbody>
              ${recordList.length ? recordList.map(r => `
                <tr>
                  <td>${r.id}</td>
                  <td>${r.type || '-'}</td>
                  <td>${r.direction === 'in' ? '<span class="badge badge-green">收入</span>' : '<span class="badge badge-red">支出</span>'}</td>
                  <td>¥${r.amount}</td>
                  <td style="font-family:monospace;font-size:12px">${r.order_no || '-'}</td>
                  <td style="font-size:12px;color:#64748b">${r.created_at || ''}</td>
                </tr>
              `).join('') : '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:40px">暂无记录</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function filterFinanceDateRange(range) {
    financeDateRange = range;
    go('finance');
  }

  function filterFinanceType(type) {
    financeTypeFilter = type;
    go('finance');
  }

  async function doReconcile() {
    try {
      const res = await AdminAPI.reconcileFinance();
      const msg = res.isMatched
        ? '对账完成，账目一致！\n订单总额: ¥' + res.orderPaidAmount + ' (' + res.orderCount + '单)\n支付总额: ¥' + res.paymentAmount + ' (' + res.paymentCount + '笔)'
        : '对账完成，存在差异！\n订单总额: ¥' + res.orderPaidAmount + '\n支付总额: ¥' + res.paymentAmount + '\n差异: ¥' + res.diff;
      alert(msg);
    } catch (e) { toast('对账失败: ' + e.message); }
  }

  /* ---- User Reports ---- */
  async function renderUserReports() {
    const data = await AdminAPI.getUserReports();
    const maxCount = Math.max(...data.newUsersTrend.map(t => t.count), 1);
    return `
      <div class="page-header"><h1 class="page-title">用户数据看板</h1></div>
      <div class="stat-grid">
        <div class="stat-card"><span class="stat-label">总用户数</span><span class="stat-value">${data.totalUsers}</span><span class="stat-icon">👥</span></div>
        <div class="stat-card"><span class="stat-label">LTV (人均价值)</span><span class="stat-value green">¥${data.ltv}</span><span class="stat-icon">💎</span></div>
        <div class="stat-card"><span class="stat-label">总收入</span><span class="stat-value">¥${data.totalRevenue}</span><span class="stat-icon">💰</span></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">近7天新增用户趋势</span></div>
        <div class="chart-container">
          ${data.newUsersTrend.map(t => `
            <div class="bar-group">
              <div class="bar" style="height: ${(t.count / maxCount * 160)}px">
                <span class="bar-value">${t.count}</span>
              </div>
              <span class="bar-label">${t.date}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-card"><span class="stat-label">次日留存率</span><span class="stat-value">${data.retention.day1}%</span></div>
        <div class="stat-card"><span class="stat-label">7日留存率</span><span class="stat-value">${data.retention.day7}%</span></div>
        <div class="stat-card"><span class="stat-label">30日留存率</span><span class="stat-value">${data.retention.day30}%</span></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">用户来源分布</span></div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>来源</th><th>用户数</th><th>占比</th></tr></thead>
            <tbody>
              ${data.sourceDistribution.length ? data.sourceDistribution.map(s => `
                <tr>
                  <td>${s.source || '未知'}</td>
                  <td>${s.count}</td>
                  <td>${data.totalUsers ? (s.count / data.totalUsers * 100).toFixed(1) : 0}%</td>
                </tr>
              `).join('') : '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:40px">暂无数据</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ---- Operation Logs ---- */
  let logsPage = 1;

  async function renderLogs() {
    const data = await AdminAPI.getLogs(logsPage);
    const list = data.list || [];
    const totalPages = Math.ceil((data.total || 0) / (data.pageSize || 20));
    return `
      <div class="page-header"><h1 class="page-title">操作日志</h1></div>
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>ID</th><th>管理员</th><th>操作</th><th>目标</th><th>详情</th><th>时间</th></tr></thead>
            <tbody>
              ${list.length ? list.map(l => `
                <tr>
                  <td>${l.id}</td>
                  <td>${l.admin_real_name || l.admin_username || '-'}</td>
                  <td>${l.action || '-'}</td>
                  <td>${l.target || '-'}</td>
                  <td style="max-width:300px;color:#64748b;font-size:12px">${l.detail || '-'}</td>
                  <td style="font-size:12px;color:#64748b">${l.created_at || ''}</td>
                </tr>
              `).join('') : '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:40px">暂无日志</td></tr>'}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
          <div class="pagination">
            <button class="btn btn-sm btn-outline" ${logsPage <= 1 ? 'disabled' : ''} onclick="Admin.goLogsPage(${logsPage - 1})">上一页</button>
            <span style="padding:4px 10px">${logsPage} / ${totalPages}</span>
            <button class="btn btn-sm btn-outline" ${logsPage >= totalPages ? 'disabled' : ''} onclick="Admin.goLogsPage(${logsPage + 1})">下一页</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function goLogsPage(page) {
    logsPage = page;
    go('logs');
  }

  /* ---- Product Import/Export ---- */
  async function renderProductImportExport() {
    return `
      <div class="page-header"><h1 class="page-title">商品批量导入导出</h1></div>
      <div class="card">
        <div class="card-header"><span class="card-title">导出商品</span></div>
        <p style="color:#64748b;margin-bottom:16px">将当前所有商品导出为 CSV 文件。</p>
        <button class="btn btn-primary" onclick="Admin.exportProductsCsv()">导出 CSV</button>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">导入商品</span></div>
        <p style="color:#64748b;margin-bottom:10px">支持 CSV 或 JSON 格式。必填字段：name, categoryId, salePrice。</p>
        <input type="file" id="import-file" accept=".csv,.json" />
        <div style="margin-top:10px"><button class="btn btn-primary" onclick="Admin.importProductsFile()">导入</button></div>
        <div id="import-result" style="margin-top:10px"></div>
      </div>
    `;
  }

  async function exportProductsCsv() {
    try {
      const data = await AdminAPI.exportProducts();
      const rawList = data.list || [];
      if (!rawList.length) { toast('暂无商品可导出'); return; }
      const list = rawList.map(p => ({
        id: p.id,
        name: p.name,
        subtitle: p.subtitle,
        categoryId: p.category_id,
        categoryName: p.category_name,
        unit: p.unit,
        costPrice: p.cost_price,
        marketPrice: p.market_price,
        salePrice: p.sale_price,
        commissionRate: p.commission_rate,
        origin: p.origin,
        storageType: p.storage_type,
        mainImage: p.main_image,
        salesCount: p.sales_count,
        status: p.status,
      }));
      const headers = ['id', 'name', 'subtitle', 'categoryId', 'categoryName', 'unit', 'costPrice', 'marketPrice', 'salePrice', 'commissionRate', 'origin', 'storageType', 'mainImage', 'salesCount', 'status'];
      const csv = [headers.join(',')].concat(list.map(p => headers.map(h => {
        const v = p[h] !== undefined && p[h] !== null ? String(p[h]) : '';
        return v.includes(',') || v.includes('"') ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','))).join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products_' + new Date().toISOString().substring(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast('已导出 ' + list.length + ' 条商品');
    } catch (e) { toast('导出失败: ' + e.message); }
  }

  async function importProductsFile() {
    const fileInput = document.getElementById('import-file');
    const file = fileInput.files[0];
    if (!file) { toast('请选择文件'); return; }
    const resultDiv = document.getElementById('import-result');
    try {
      const text = await file.text();
      let products = [];
      if (file.name.endsWith('.json')) {
        products = JSON.parse(text);
      } else {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { toast('CSV 文件为空'); return; }
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        products = lines.slice(1).map(line => {
          const values = [];
          let cur = '', inQ = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQ = !inQ; }
            else if (c === ',' && !inQ) { values.push(cur); cur = ''; }
            else { cur += c; }
          }
          values.push(cur);
          const obj = {};
          headers.forEach((h, i) => { obj[h] = values[i] ? values[i].trim() : ''; });
          return obj;
        });
      }
      if (!Array.isArray(products) || !products.length) { toast('文件中无有效数据'); return; }
      products = products.map(p => ({
        name: p.name,
        subtitle: p.subtitle || '',
        categoryId: parseInt(p.categoryId) || parseInt(p.category_id) || 0,
        unit: p.unit || '份',
        costPrice: parseFloat(p.costPrice || p.cost_price || 0),
        marketPrice: parseFloat(p.marketPrice || p.market_price || 0),
        salePrice: parseFloat(p.salePrice || p.sale_price || 0),
        commissionRate: parseFloat(p.commissionRate || p.commission_rate || 8),
        origin: p.origin || '',
        storageType: p.storageType || p.storage_type || '',
        mainImage: p.mainImage || p.main_image || '',
      }));
      const res = await AdminAPI.importProducts(products);
      resultDiv.innerHTML = '<div class="badge badge-green">导入成功 ' + res.successCount + ' 条，失败 ' + res.failedCount + ' 条</div>';
      if (res.failed && res.failed.length) {
        resultDiv.innerHTML += '<div style="margin-top:10px;color:#991b1b;font-size:12px">失败详情：<br>' + res.failed.map(f => '第' + (f.index + 1) + '行: ' + f.reason).join('<br>') + '</div>';
      }
      toast('导入完成: 成功 ' + res.successCount + ' 条');
    } catch (e) { toast('导入失败: ' + e.message); }
  }

  /* ---- Rider Performance ---- */
  let currentRiderId = null;

  function viewRiderPerformance(id) {
    currentRiderId = id;
    go('rider-performance');
  }

  async function renderRiderPerformance() {
    if (!currentRiderId) { return '<div class="empty-state"><p>请从骑手列表进入</p></div>'; }
    const data = await AdminAPI.getRiderPerformance(currentRiderId);
    const r = data.rider;
    const s = data.stats;
    return `
      <div class="page-header">
        <h1 class="page-title">骑手绩效 - ${r.name}</h1>
        <div class="page-actions"><button class="btn btn-outline" onclick="Admin.go('riders')">返回列表</button></div>
      </div>
      <div class="stat-grid">
        <div class="stat-card"><span class="stat-label">总订单数</span><span class="stat-value">${s.totalOrders}</span><span class="stat-icon">📦</span></div>
        <div class="stat-card"><span class="stat-label">已完成订单</span><span class="stat-value green">${s.completedOrders}</span><span class="stat-icon">✅</span></div>
        <div class="stat-card"><span class="stat-label">已取消订单</span><span class="stat-value red">${s.cancelledOrders}</span><span class="stat-icon">❌</span></div>
        <div class="stat-card"><span class="stat-label">平均配送时长</span><span class="stat-value">${s.avgDeliveryMinutes}分钟</span><span class="stat-icon">⏱️</span></div>
        <div class="stat-card"><span class="stat-label">平均评分</span><span class="stat-value">⭐ ${s.avgRating}</span><span class="stat-icon">🌟</span></div>
        <div class="stat-card"><span class="stat-label">投诉次数</span><span class="stat-value ${s.complaintCount > 0 ? 'red' : ''}">${s.complaintCount}</span><span class="stat-icon">⚠️</span></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">骑手信息</span></div>
        <div style="padding:10px 0">
          <p style="margin-bottom:8px"><strong>姓名：</strong>${r.name}</p>
          <p style="margin-bottom:8px"><strong>电话：</strong>${r.phone || '-'}</p>
          <p style="margin-bottom:8px"><strong>状态：</strong>${r.status === 1 ? '<span class="badge badge-green">在职</span>' : '<span class="badge badge-gray">离线</span>'}</p>
          <p><strong>注册时间：</strong>${r.createdAt || '-'}</p>
        </div>
      </div>
    `;
  }

  /* ---- Order Dispatch ---- */
  async function renderOrderDispatch() {
    const [ordersData, ridersData] = await Promise.all([
      AdminAPI.getDispatchOrders(),
      AdminAPI.getRiders({ pageSize: 100, status: 1 }),
    ]);
    const orders = ordersData.list || [];
    const riders = ridersData.list || [];
    return `
      <div class="page-header"><h1 class="page-title">订单调度</h1></div>
      <div class="stat-row">
        <div class="stat-card"><span class="stat-label">待调度订单</span><span class="stat-value orange">${ordersData.total || 0}</span></div>
        <div class="stat-card"><span class="stat-label">在线骑手</span><span class="stat-value green">${riders.length}</span></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">待调度订单列表</span></div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>订单号</th><th>用户</th><th>社区</th><th>仓库</th><th>商品</th><th>金额</th><th>下单时间</th><th>操作</th></tr></thead>
            <tbody>
              ${orders.length ? orders.map(o => `
                <tr>
                  <td style="font-family:monospace;font-size:12px">${o.order_no}</td>
                  <td>${o.nick_name || '-'}<br><span style="color:#94a3b8;font-size:12px">${o.phone || ''}</span></td>
                  <td>${o.community_name || '-'}</td>
                  <td>${o.warehouse_name || '-'}</td>
                  <td>${(o.items || []).length} 件</td>
                  <td>¥${(o.pay_amount || 0).toFixed(2)}</td>
                  <td style="font-size:12px;color:#64748b">${o.created_at || ''}</td>
                  <td>
                    <select class="filter-select" id="dispatch-rider-${o.id}" style="margin-bottom:4px;display:block">
                      ${riders.length ? riders.map(r => `<option value="${r.id}">${r.name} (当前${r.currentOrders || 0}单)</option>`).join('') : '<option value="">暂无骑手</option>'}
                    </select>
                    <button class="btn btn-sm btn-primary" onclick="Admin.assignRiderToOrder(${o.id})" ${riders.length ? '' : 'disabled'}>分配</button>
                    <button class="btn btn-sm btn-danger" onclick="Admin.showCancelOrderModal(${o.id})">取消</button>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:40px">暂无待调度订单</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="modal-container"></div>
    `;
  }

  async function assignRiderToOrder(orderId) {
    const select = document.getElementById('dispatch-rider-' + orderId);
    const riderId = parseInt(select.value);
    if (!riderId) { toast('请选择骑手'); return; }
    try {
      await AdminAPI.assignRider(orderId, riderId);
      toast('骑手已分配');
      go('order-dispatch');
    } catch (e) { toast('分配失败: ' + e.message); }
  }

  function showCancelOrderModal(orderId) {
    const container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">取消订单</h3>
          <div class="form-group"><label class="form-label">取消原因</label><textarea class="form-input" id="cancel-reason" rows="3" placeholder="请输入取消原因"></textarea></div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-danger" onclick="Admin.submitCancelOrder(${orderId})">确认取消</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitCancelOrder(orderId) {
    const reason = document.getElementById('cancel-reason').value;
    try {
      await AdminAPI.adminCancelOrder(orderId, reason);
      toast('订单已取消');
      closeModal();
      go('order-dispatch');
    } catch (e) { toast('取消失败: ' + e.message); }
  }

  /* ---- RBAC Management ---- */
  let rbacTab = 'roles';
  let roleCache = [];

  async function renderRbac() {
    if (rbacTab === 'users') {
      return await renderAdminUsers();
    }
    return await renderRoles();
  }

  async function renderRoles() {
    const data = await AdminAPI.getRoles();
    roleCache = data.list || [];
    return `
      <div class="page-header">
        <h1 class="page-title">权限管理</h1>
        <div class="page-actions">
          <button class="btn ${rbacTab === 'roles' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="Admin.switchRbacTab('roles')">角色管理</button>
          <button class="btn ${rbacTab === 'users' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="Admin.switchRbacTab('users')">管理员账号</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">角色列表</span>
          <button class="btn btn-sm btn-primary" onclick="Admin.showRoleModal()">+ 新建角色</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>ID</th><th>角色名称</th><th>权限</th><th>用户数</th><th>操作</th></tr></thead>
            <tbody>
              ${roleCache.length ? roleCache.map(r => {
                let perms = [];
                try { perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []); } catch (e) {}
                return `
                  <tr>
                    <td>${r.id}</td>
                    <td>${r.name}</td>
                    <td>${perms.length ? perms.map(p => `<span class="badge badge-blue" style="margin:1px">${p}</span>`).join('') : '<span class="badge badge-gray">无</span>'}</td>
                    <td>${r.user_count || 0}</td>
                    <td><button class="btn btn-sm btn-outline" onclick="Admin.showRoleModal(${r.id})">编辑</button></td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:40px">暂无角色</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function showRoleModal(id) {
    const container = document.getElementById('modal-container');
    if (!container) return;
    const r = id ? roleCache.find(x => x.id === id) : null;
    let perms = [];
    if (r) {
      try { perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []); } catch (e) {}
    }
    const allPermissions = [
      { v: '*', l: '所有权限' },
      { v: 'product:manage', l: '商品管理' },
      { v: 'order:manage', l: '订单管理' },
      { v: 'order:dispatch', l: '订单调度' },
      { v: 'leader:manage', l: '团长管理' },
      { v: 'rider:manage', l: '骑手管理' },
      { v: 'inventory:manage', l: '库存管理' },
      { v: 'coupon:manage', l: '优惠券管理' },
      { v: 'banner:manage', l: 'Banner管理' },
      { v: 'finance:manage', l: '资金管理' },
      { v: 'user:manage', l: '用户管理' },
      { v: 'rbac:manage', l: '权限管理' },
    ];
    container.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">${r ? '编辑角色' : '新建角色'}</h3>
          <div class="form-group"><label class="form-label">角色名称 *</label><input class="form-input" id="role-name" value="${r ? (r.name || '') : ''}" /></div>
          <div class="form-group"><label class="form-label">权限</label>
            <div style="max-height:250px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;padding:10px">
              ${allPermissions.map(p => `<label style="display:block;padding:3px 0"><input type="checkbox" class="role-perm" value="${p.v}" ${perms.includes(p.v) ? 'checked' : ''} /> ${p.l} (${p.v})</label>`).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="Admin.submitRole(${r ? r.id : 'null'})">${r ? '保存' : '创建'}</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitRole(id) {
    const name = document.getElementById('role-name').value.trim();
    if (!name) { toast('角色名称不能为空'); return; }
    const checked = document.querySelectorAll('.role-perm:checked');
    const permissions = Array.from(checked).map(c => c.value);
    try {
      if (id) {
        await AdminAPI.updateRole(id, { name, permissions });
        toast('角色已更新');
      } else {
        await AdminAPI.createRole({ name, permissions });
        toast('角色已创建');
      }
      closeModal();
      go('rbac');
    } catch (e) { toast('操作失败: ' + e.message); }
  }

  async function renderAdminUsers() {
    const [data, rolesData] = await Promise.all([
      AdminAPI.getAdminUsers(),
      AdminAPI.getRoles(),
    ]);
    const list = data.list || [];
    const roles = rolesData.list || [];
    roleCache = roles;
    return `
      <div class="page-header">
        <h1 class="page-title">权限管理</h1>
        <div class="page-actions">
          <button class="btn ${rbacTab === 'roles' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="Admin.switchRbacTab('roles')">角色管理</button>
          <button class="btn ${rbacTab === 'users' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="Admin.switchRbacTab('users')">管理员账号</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">管理员账号列表</span>
          <button class="btn btn-sm btn-primary" onclick="Admin.showAdminUserModal()">+ 添加管理员</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>ID</th><th>用户名</th><th>姓名</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              ${list.length ? list.map(a => `
                <tr>
                  <td>${a.id}</td>
                  <td>${a.username}</td>
                  <td>${a.real_name || '-'}</td>
                  <td>${a.role_name ? `<span class="badge badge-blue">${a.role_name}</span>` : '<span class="badge badge-gray">未分配</span>'}</td>
                  <td>${a.status === 1 ? '<span class="badge badge-green">启用</span>' : '<span class="badge badge-red">禁用</span>'}</td>
                  <td style="font-size:12px;color:#64748b">${a.created_at || ''}</td>
                  <td>
                    <button class="btn btn-sm ${a.status === 1 ? 'btn-outline' : 'btn-primary'}" onclick="Admin.toggleAdminUser(${a.id}, ${a.status === 1 ? 0 : 1})">${a.status === 1 ? '禁用' : '启用'}</button>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:40px">暂无管理员</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="modal-container"></div>
    `;
  }

  function switchRbacTab(tab) {
    rbacTab = tab;
    go('rbac');
  }

  function showAdminUserModal() {
    const container = document.getElementById('modal-container');
    if (!container) return;
    const roles = roleCache || [];
    container.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Admin.closeModal()">
        <div class="modal">
          <h3 class="modal-title">添加管理员账号</h3>
          <div class="form-group"><label class="form-label">用户名 *</label><input class="form-input" id="au-username" placeholder="登录用户名" /></div>
          <div class="form-group"><label class="form-label">密码 *</label><input class="form-input" id="au-password" type="password" placeholder="登录密码" /></div>
          <div class="form-group"><label class="form-label">姓名</label><input class="form-input" id="au-realName" placeholder="真实姓名" /></div>
          <div class="form-group"><label class="form-label">角色</label><select class="form-input" id="au-roleId"><option value="">请选择角色</option>${roles.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="Admin.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="Admin.submitAdminUser()">创建</button>
          </div>
        </div>
      </div>
    `;
  }

  async function submitAdminUser() {
    const data = {
      username: document.getElementById('au-username').value.trim(),
      password: document.getElementById('au-password').value,
      realName: document.getElementById('au-realName').value,
      roleId: document.getElementById('au-roleId').value ? parseInt(document.getElementById('au-roleId').value) : null,
    };
    if (!data.username || !data.password) { toast('用户名和密码不能为空'); return; }
    try {
      await AdminAPI.createAdminUser(data);
      toast('管理员账号创建成功');
      closeModal();
      go('rbac');
    } catch (e) { toast('创建失败: ' + e.message); }
  }

  async function toggleAdminUser(id, status) {
    try {
      await AdminAPI.updateAdminUserStatus(id, status);
      toast('状态已更新');
      go('rbac');
    } catch (e) { toast('操作失败: ' + e.message); }
  }

  /* ---- Inventory Warnings ---- */
  async function renderInventoryWarnings() {
    const data = await AdminAPI.getInventoryWarnings();
    const list = data.list || [];
    return `
      <div class="page-header"><h1 class="page-title">库存预警</h1></div>
      <div class="stat-row">
        <div class="stat-card"><span class="stat-label">预警商品数</span><span class="stat-value red">${data.total || 0}</span></div>
      </div>
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>商品</th><th>分类</th><th>仓库</th><th>可售库存</th><th>预警阈值</th><th>缺口</th><th>更新时间</th></tr></thead>
            <tbody>
              ${list.length ? list.map(i => `
                <tr style="background:#fee2e2">
                  <td>${i.skuName || '-'}</td>
                  <td>${i.categoryName || '-'}</td>
                  <td>${i.warehouseName || '-'}</td>
                  <td><strong style="color:#991b1b">${i.availableStock}</strong></td>
                  <td>${i.warningThreshold}</td>
                  <td><span class="badge badge-red">缺 ${i.shortage}</span></td>
                  <td style="font-size:12px;color:#64748b">${i.updatedAt || ''}</td>
                </tr>
              `).join('') : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:40px">暂无预警库存</td></tr>'}
            </tbody>
          </table>
        </div>
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

  return {
    init, go, toast, closeModal,
    filterOrders, reloadDashboard,
    showProductModal, submitProduct, toggleProduct,
    showCouponModal, submitCoupon,
    toggleLeader,
    showRiderModal, submitRider, toggleRider, viewRiderPerformance,
    filterInventory, showInventoryModal, submitInventory,
    submitAdminLogin, adminLogout,
    showBannerModal, submitBanner, toggleBannerStatus, deleteBanner,
    showMemberRuleModal, submitMemberRule,
    filterCommunitySku, showCommunitySkuModal, submitCommunitySku, removeCommunitySku, showBatchSkuModal, submitBatchSku,
    filterLeaderApp, showApproveModal, submitApprove, showRejectModal, submitReject,
    filterFinanceDateRange, filterFinanceType, doReconcile,
    goLogsPage,
    exportProductsCsv, importProductsFile,
    assignRiderToOrder, showCancelOrderModal, submitCancelOrder,
    switchRbacTab, showRoleModal, submitRole, showAdminUserModal, submitAdminUser, toggleAdminUser,
  };
})();

document.addEventListener('DOMContentLoaded', () => Admin.init());
