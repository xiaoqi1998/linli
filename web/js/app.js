/* ==========================================================================
   邻里鲜生 · App Core (Router, State, UI Helpers)
   ========================================================================== */

const App = (function () {
  // ---- Global State ----
  const state = {
    user: null,
    community: null,
    cart: [],
    currentRoute: null,
    buyNowItem: null,     // for "buy now" flow (bypass cart)
    orderFilter: 'all',   // order list filter
  };

  // ---- DOM refs ----
  const pageContainer = document.getElementById('page-container');
  const appContent = document.getElementById('app-content');
  const tabBar = document.getElementById('tab-bar');
  const cartFloat = document.getElementById('cart-float');

  /* ========================================================================
     Router
     ======================================================================== */
  const routes = {
    'auth': { render: () => AuthPage.render(), tab: null, showTab: false, showCart: false, full: true },
    'home': { render: () => HomePage.render(), tab: 'home', showTab: true, showCart: true },
    'search': { render: () => SearchPage.render(), tab: null, showTab: false, showCart: false, full: true },
    'category': { render: () => CategoryPage.render(), tab: 'category', showTab: true, showCart: true },
    'orders': { render: () => OrderListPage.render(), tab: 'orders', showTab: true, showCart: false },
    'member': { render: () => MemberPage.render(), tab: 'member', showTab: true, showCart: false },
    'product/:id': { render: (params) => ProductPage.render(params.id), tab: null, showTab: false, showCart: false, full: true },
    'cart': { render: () => CartPage.render(), tab: null, showTab: false, showCart: false, full: true },
    'order-confirm': { render: () => OrderConfirmPage.render(), tab: null, showTab: false, showCart: false, full: true },
    'order-detail/:no': { render: (params) => OrderDetailPage.render(params.no), bind: () => { const m = document.getElementById('rider-map'); if (m) OrderDetailPage.mountRiderMap(location.hash.split('/')[2]); }, tab: null, showTab: false, showCart: false, full: true },
    'group-buy': { render: () => GroupBuyPage.render(), tab: null, showTab: false, showCart: false },
    'group-buy/:id': { render: (params) => GroupBuyPage.renderDetail(params.id), tab: null, showTab: false, showCart: false, full: true },
    'addresses': { render: () => MemberPage.renderAddresses(), tab: null, showTab: false, showCart: false, full: true },
    'address-edit/:id': { render: (params) => MemberPage.renderAddressEdit(params.id), bind: () => MemberPage.bindMapPicker(), tab: null, showTab: false, showCart: false, full: true },
    'coupons': { render: () => MemberPage.renderCoupons(), tab: null, showTab: false, showCart: false, full: true },
    'points': { render: () => MemberPage.renderPoints(), tab: null, showTab: false, showCart: false, full: true },
    'pay-success/:no': { render: (params) => renderPaySuccess(params.no), tab: null, showTab: false, showCart: false, full: true },
    'proxy-pay/:token': { render: (params) => ProxyPayPage.render(params.token), tab: null, showTab: false, showCart: false, full: true },
  };

  function parseHash() {
    let hash = location.hash.replace(/^#\/?/, '');
    if (!hash) hash = 'home';
    const parts = hash.split('/');
    const routeKey = parts[0];
    const param = parts.slice(1).join('/');
    return { routeKey, param, hash };
  }

  function matchRoute(routeKey, param) {
    // Try exact match first
    if (routes[routeKey] && !param) return { route: routes[routeKey], params: {} };
    // Try param match
    for (const key in routes) {
      if (key.includes(':')) {
        const [k, pName] = key.split('/:');
        if (k === routeKey && param) {
          return { route: routes[key], params: { [pName]: param } };
        }
      }
    }
    // Fallback
    return { route: routes['home'], params: {} };
  }

  async function navigate() {
    const { routeKey, param } = parseHash();
    const { route, params } = matchRoute(routeKey, param);

    // Auth guard: if no token and not on auth page, redirect to auth
    if (routeKey !== 'auth' && !API.getToken()) {
      location.hash = '#/auth';
      return;
    }

    state.currentRoute = routeKey;

    // Show loading
    pageContainer.innerHTML = '<div class="ptr-spinner"><div class="spinner"></div></div>';

    // Tab bar visibility
    if (route.showTab) {
      tabBar.style.display = 'flex';
      updateTabActive(route.tab);
    } else {
      tabBar.style.display = 'none';
    }

    // Cart float visibility
    if (route.showCart) updateCartFloat();
    else cartFloat.classList.add('hidden');

    // Scroll to top
    appContent.scrollTop = 0;

    try {
      const html = await route.render(params);
      if (html) {
        const demoBadge = route.showTab ? `<div class="demo-badge" style="position:fixed;right:8px;bottom:72px;z-index:99;background:rgba(26,60,46,0.6);color:rgba(255,255,255,0.85);font-size:10px;padding:3px 8px;border-radius:10px;backdrop-filter:blur(4px);pointer-events:none;letter-spacing:0.5px;">演示版</div>` : '';
        pageContainer.innerHTML = html + demoBadge;
        pageContainer.classList.remove('page-enter');
        void pageContainer.offsetWidth; // reflow to restart animation
        pageContainer.classList.add('page-enter');
        // Bind events if the page exposes a mount function
        if (route.bind) route.bind();
      }
    } catch (err) {
      console.error('Route error:', err);
      pageContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-emoji">😵</div>
          <div class="empty-title">页面加载失败</div>
          <div class="empty-desc">请检查网络后重试</div>
          <button class="btn btn-primary btn-sm" onclick="location.reload()">重新加载</button>
        </div>`;
    }

    // Update cart float after render
    if (route.showCart) updateCartFloat();
  }

  function updateTabActive(tabName) {
    document.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === tabName);
    });
  }

  function go(path) {
    if (path.startsWith('#')) location.hash = path;
    else location.hash = '#/' + path;
  }

  function back() {
    history.back();
    // If no history, go home
    setTimeout(() => {
      if (!location.hash) location.hash = '#/home';
    }, 100);
  }

  /* ========================================================================
     UI Helpers: Toast, Modal, Sheet
     ======================================================================== */
  let toastTimer = null;
  function toast(msg, duration) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    // Restart animation
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), duration || 1800);
  }

  function showModal(opts) {
    const overlay = document.getElementById('modal-overlay');
    const box = document.getElementById('modal-box');
    box.innerHTML = `
      <div class="modal-title">${opts.title || '提示'}</div>
      <div class="modal-body">${opts.body || ''}</div>
      <div class="modal-actions">
        ${opts.cancelText !== null ? `<button class="btn btn-ghost" id="modal-cancel">${opts.cancelText || '取消'}</button>` : ''}
        <button class="btn btn-primary" id="modal-confirm">${opts.confirmText || '确定'}</button>
      </div>`;
    overlay.classList.remove('hidden');
    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');
    if (cancelBtn) cancelBtn.onclick = () => { overlay.classList.add('hidden'); opts.onCancel && opts.onCancel(); };
    confirmBtn.onclick = async () => {
      if (opts.onConfirm) {
        const r = await opts.onConfirm();
        if (r !== false) overlay.classList.add('hidden');
      } else {
        overlay.classList.add('hidden');
      }
    };
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  function showSheet(title, contentHtml, onMount) {
    const overlay = document.getElementById('sheet-overlay');
    const box = document.getElementById('sheet-box');
    box.innerHTML = `<div class="sheet-handle"></div><div class="sheet-title">${title}</div>${contentHtml}`;
    overlay.classList.remove('hidden');
    // Close on overlay click
    overlay.onclick = (e) => { if (e.target === overlay) closeSheet(); };
    if (onMount) onMount(box);
  }

  function closeSheet() {
    document.getElementById('sheet-overlay').classList.add('hidden');
  }

  /* ========================================================================
     Cart helpers
     ======================================================================== */
  async function refreshCart() {
    try {
      const cartData = await API.getCart();
      state.cart = Array.isArray(cartData) ? cartData : (cartData.list || []);
    } catch (e) {
      state.cart = [];
    }
    updateCartFloat();
  }

  function getCartCount() {
    return state.cart.reduce((s, i) => s + (i.quantity || 0), 0);
  }

  function getCartTotal() {
    return state.cart.filter(i => i.selected !== false).reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  }

  function getSelectedItems() {
    return state.cart.filter(i => i.selected !== false);
  }

  function updateCartFloat() {
    const count = getCartCount();
    const total = getCartTotal();
    const badge = document.getElementById('cart-float-badge');
    const totalEl = document.getElementById('cart-float-total');
    const tipEl = document.querySelector('.cart-float-tip');

    if (count === 0) {
      cartFloat.classList.add('hidden');
    } else {
      cartFloat.classList.remove('hidden');
      badge.textContent = count;
      totalEl.textContent = '¥' + total.toFixed(2);
      const remain = Math.max(0, 29 - total);
      tipEl.textContent = remain > 0 ? `还差¥${remain.toFixed(0)}免配送费` : '已免配送费';
    }
  }

  async function addToCart(productId, quantity, spec) {
    try {
      await API.addToCart(productId, quantity || 1, spec || '');
      await refreshCart();
      toast('已加入购物车');
      // Cart fly animation
      flyToCart();
    } catch (e) {
      toast('加购失败，请重试');
    }
  }

  function flyToCart() {
    // Simple bounce on the cart icon
    const icon = document.getElementById('cart-float-icon');
    if (!icon) return;
    icon.style.transition = 'transform 0.2s';
    icon.style.transform = 'scale(1.25)';
    setTimeout(() => { icon.style.transform = 'scale(1)'; }, 200);
  }

  /* ========================================================================
     Helpers
     ======================================================================== */
  function fmtMoney(n) {
    return (n || 0).toFixed(2);
  }

  function tagLabel(tag) {
    const map = { recommend: '团长推荐', special: '今日特价', new: '新品', hot: '热销' };
    return map[tag] || tag;
  }

  function tagClass(tag) {
    return 'tag-' + tag;
  }

  function productImgHtml(p) {
    return `<div class="product-img"><div class="product-img-bg ${p.bg}"></div><span class="product-img-emoji">${p.emoji}</span></div>`;
  }

  function renderProductCard(p) {
    const soldOut = (p.stock || 0) <= 0;
    const tags = (p.tags || []).slice(0, 2);
    return `
      <div class="product-card" onclick="App.go('product/${p.id}')">
        <div class="product-img">
          <div class="product-img-bg ${p.bg}"></div>
          <span class="product-img-emoji">${p.emoji}</span>
          ${tags.length ? `<div class="product-tags">${tags.map(t => `<span class="product-tag ${tagClass(t)}">${tagLabel(t)}</span>`).join('')}</div>` : ''}
          ${soldOut ? `<div class="product-soldout"><span>补货中</span></div>` : ''}
        </div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-spec">${p.spec || ''}</div>
          <div class="product-bottom">
            <div class="product-price">
              <span class="product-price-now">${fmtMoney(p.price)}</span>
              ${p.oldPrice ? `<span class="product-price-old">¥${fmtMoney(p.oldPrice)}</span>` : ''}
            </div>
            ${soldOut
              ? `<button class="add-btn disabled" onclick="event.stopPropagation()">+</button>`
              : `<button class="add-btn" onclick="event.stopPropagation();App.addToCart(${p.id},1,'')">+</button>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function statusText(status) {
    const map = { 10: '待付款', 20: '待配送', 30: '配送中', 40: '已送达', 50: '已完成', 99: '已取消' };
    return map[status] || '未知';
  }

  function statusClass(status) {
    const map = { 10: 'pending', 20: 'pending', 30: 'delivering', 50: 'completed', 99: 'cancelled' };
    return map[status] || '';
  }

  function skeletonGrid(n) {
    n = n || 6;
    let html = '<div class="skeleton-grid">';
    for (let i = 0; i < n; i++) {
      html += `<div class="skeleton-card">
        <div class="skeleton-img skeleton"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line skeleton"></div>
          <div class="skeleton-line short skeleton"></div>
        </div>
      </div>`;
    }
    html += '</div>';
    return html;
  }

  function emptyState(emoji, title, desc, btnText, btnAction) {
    return `<div class="empty-state">
      <div class="empty-emoji">${emoji}</div>
      <div class="empty-title">${title}</div>
      <div class="empty-desc">${desc}</div>
      ${btnText ? `<button class="btn btn-primary btn-sm" onclick="${btnAction}">${btnText}</button>` : ''}
    </div>`;
  }

  /* ========================================================================
     Pay success page
     ======================================================================== */
  async function renderPaySuccess(orderNo) {
    let payAmount = 0;
    try {
      const order = await API.getOrder(orderNo);
      payAmount = order.payAmount || 0;
    } catch (e) {}
    setTimeout(() => {
      state.buyNowItem = null;
    }, 100);
    return `
      <div class="nav-header">
        <div class="nav-back" onclick="App.back()">‹</div>
        <div class="nav-title">支付结果</div>
      </div>
      <div class="pay-success">
        <div class="pay-success-icon">✅</div>
        <div class="pay-success-title">支付成功</div>
        <div class="pay-success-amount">${App.fmtMoney(payAmount)}</div>
        <p class="text-muted fs-13 mb-12">订单号：${orderNo}</p>
        <p class="text-muted fs-13 mb-12">骑手正在为您备货，预计30分钟内送达</p>
        <div style="display:flex;gap:12px;margin-top:12px;">
          <button class="btn btn-ghost" onclick="App.go('home')">返回首页</button>
          <button class="btn btn-primary" onclick="App.go('order-detail/${orderNo}')">查看订单</button>
        </div>
      </div>`;
  }

  /* ========================================================================
     Init
     ======================================================================== */
  async function init() {
    // Check if user has a token — if not, go to login page
    const token = API.getToken();
    if (!token) {
      // No token → show login page
      window.addEventListener('hashchange', navigate);
      location.hash = '#/auth';
      navigate();
      return;
    }

    // Token exists — try to load user data
    try {
      state.user = await API.getProfile();
    } catch (e) {
      // Token invalid or server down — try guest login
      try {
        const res = await API.loginGuest();
        if (res && res.token) {
          API.setToken(res.token);
          state.user = res;
        } else {
          state.user = API.mock.USER;
        }
      } catch (e2) {
        state.user = API.mock.USER;
      }
    }

    // Load community
    try {
      state.community = await API.getCommunity();
    } catch (e) {
      state.community = API.mock.COMMUNITY;
    }

    // Load cart
    await refreshCart();

    // Cart float button
    document.getElementById('cart-float-btn').addEventListener('click', () => go('cart'));
    document.getElementById('cart-float-icon').addEventListener('click', () => go('cart'));

    // Router
    window.addEventListener('hashchange', navigate);
    if (!location.hash || location.hash === '#/auth') location.hash = '#/home';
    else navigate();
  }



  // ---- Public API ----
  return {
    state,
    init, navigate, go, back,
    toast, showModal, closeModal, showSheet, closeSheet,
    refreshCart, updateCartFloat, addToCart, getCartCount, getCartTotal, getSelectedItems,
    fmtMoney, tagLabel, tagClass, productImgHtml, renderProductCard, statusText, statusClass,
    skeletonGrid, emptyState,
  };
})();

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
