/* ==========================================================================
   邻里鲜生 · Home Page
   ========================================================================== */

const HomePage = (function () {
  let bannerIndex = 0;
  let bannerTimer = null;
  let currentData = { products: [], categories: [], banners: [] };

  async function render() {
    // Return skeleton immediately, load data, then re-render content area
    const html = `
      <div class="home-header">
        <div class="community-bar">
          <div class="community-info" onclick="HomePage.switchCommunity()">
            <span class="community-icon">📍</span>
            <span class="community-name">${App.state.community ? App.state.community.name : '定位中...'}</span>
            <span class="community-arrow">▾</span>
          </div>
          <div class="community-eta">
            <span>🚴</span>
            <span>${App.state.community ? (parseInt(App.state.community.eta) || 30) : 30}分钟达</span>
          </div>
        </div>
        <div class="search-bar" onclick="HomePage.openSearch()">
          <span class="search-icon">🔍</span>
          <span class="search-input" style="color:var(--color-muted)">搜索新鲜好物，如"番茄"</span>
        </div>
      </div>
      <div id="home-body">${App.skeletonGrid(6)}</div>
    `;

    // Load data asynchronously
    loadData();
    return html;
  }

  async function loadData() {
    // Track page view
    API.trackEvent('home_page_view');

    // Fetch user's selected community (update display if available)
    try {
      const userCommunity = await API.getUserCommunity();
      if (userCommunity && userCommunity.id) {
        App.state.community = {
          id: userCommunity.id,
          name: userCommunity.name,
          address: userCommunity.address,
          eta: userCommunity.eta || 30,
        };
        const nameEl = document.querySelector('.community-name');
        if (nameEl) nameEl.textContent = userCommunity.name;
        const etaEls = document.querySelectorAll('.community-eta span');
        if (etaEls.length >= 2) etaEls[etaEls.length - 1].textContent = (parseInt(userCommunity.eta) || 30) + '分钟达';
      }
    } catch (e) {
      // keep existing community from auto-locate
    }

    try {
      const [products, categories, banners] = await Promise.all([
        API.getProducts({ pageSize: 100 }),
        API.getCategories(),
        API.getBanners(),
      ]);
      currentData.products = products.list || products || [];
      // Normalize categories: API returns {id, name, icon(url), emoji, bg}
      const rawCats = Array.isArray(categories) ? categories : (categories.list || []);
      const CAT_EMOJI = {'蔬菜':'🥬','水果':'🍎','肉禽蛋':'🥚','水产':'🐟','粮油调味':'🍚','乳制品':'🥛','零食饮料':'🥤','日用百货':'🧻'};
      const CAT_BG = {'蔬菜':'bg-veg','水果':'bg-fruit','肉禽蛋':'bg-meat','水产':'bg-sea','粮油调味':'bg-grain','乳制品':'bg-milk','零食饮料':'bg-snack','日用百货':'bg-daily'};
      currentData.categories = rawCats.map(c => ({
        id: c.id, name: c.name,
        icon: c.icon || '',
        emoji: c.emoji || CAT_EMOJI[c.name] || '🛒',
        bg: c.bg || CAT_BG[c.name] || 'bg-veg',
      }));
      // Normalize banners: API returns {list: [{id, title, subtitle, image, linkType, linkValue, bg}]}
      // Frontend expects {id, title, subtitle, image, emoji, bg, link}
      const rawBanners = Array.isArray(banners) ? banners : (banners.list || []);
      const BANNER_BG_MAP = {'banner-fresh': 'bg-fruit', 'banner-group': 'bg-green', 'banner-new': 'bg-gold'};
      const BANNER_EMOJI_MAP = {'banner-fresh': '🍒', 'banner-group': '🛒', 'banner-new': '🎁'};
      const BANNER_LINK_MAP = {category: 'category', groupBuy: 'group-buy', coupon: 'home', product: 'product'};
      currentData.banners = rawBanners.length ? rawBanners.map(b => ({
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        image: b.image || '',
        emoji: b.emoji || BANNER_EMOJI_MAP[b.bg] || '🛒',
        bg: BANNER_BG_MAP[b.bg] || b.bg || 'bg-green',
        link: b.link || (b.linkType === 'groupBuy' ? 'group-buy' : b.linkType === 'category' ? 'category' : 'home'),
      })) : API.mock.BANNERS;
      renderBody();
    } catch (e) {
      // Fallback to mock
      currentData.products = API.mock.PRODUCTS;
      currentData.categories = API.mock.CATEGORIES;
      currentData.banners = API.mock.BANNERS;
      renderBody();
    }
  }

  function renderBody() {
    const body = document.getElementById('home-body');
    if (!body) return;

    const { products, categories, banners } = currentData;

    // Auto-assign tags if products don't have them (API products may lack tag fields)
    const sortedBySales = [...products].sort((a, b) => (b.sales || 0) - (a.sales || 0));
    const hasTags = products.some(p => p.tags && p.tags.length);
    if (!hasTags) {
      products.forEach(p => {
        p.tags = [];
        // Top 4 by sales → recommend
        if (sortedBySales.indexOf(p) < 4) p.tags.push('recommend');
        // Significant discount (>30% off) → special
        if (p.oldPrice && p.price && p.oldPrice > p.price * 1.3) p.tags.push('special');
        // Top 8 by sales → hot
        if (sortedBySales.indexOf(p) < 8) p.tags.push('hot');
      });
    }

    // Split products into sections
    const recommend = products.filter(p => p.tags && p.tags.includes('recommend'));
    const special = products.filter(p => p.tags && p.tags.includes('special'));
    const hot = products.filter(p => p.tags && p.tags.includes('hot'));

    body.innerHTML = `
      <!-- Banner Carousel -->
      <div class="banner-wrap">
        <div class="banner-carousel" id="banner-carousel">
          <div class="banner-track" id="banner-track">
            ${banners.map(b => `
              <div class="banner-slide" onclick="App.go('${b.link}')">
                <div class="banner-slide-bg ${b.bg}"></div>
                <div class="banner-slide-content">
                  <div class="banner-slide-title">${b.title}</div>
                  <div class="banner-slide-sub">${b.subtitle}</div>
                </div>
                ${b.image ? `<img src="${b.image}" class="banner-slide-emoji" onerror="this.outerHTML='<span class=\\'banner-slide-emoji\\'>${b.emoji}</span>'">` : `<span class="banner-slide-emoji">${b.emoji}</span>`}
              </div>
            `).join('')}
          </div>
          <div class="banner-dots" id="banner-dots">
            ${banners.map((_, i) => `<div class="banner-dot ${i === 0 ? 'active' : ''}" data-idx="${i}"></div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Category Nav -->
      <div class="category-nav">
        ${categories.map(c => `
          <div class="cat-nav-item" onclick="HomePage.goCategory(${c.id})">
            ${c.icon ? `<img src="${c.icon}" class="cat-nav-emoji ${c.bg}" onerror="this.outerHTML='<span class=\\'cat-nav-emoji ${c.bg}\\'>${c.emoji}</span>'">` : `<div class="cat-nav-emoji ${c.bg}">${c.emoji}</div>`}
            <div class="cat-nav-label">${c.name}</div>
          </div>
        `).join('')}
      </div>

      <!-- Group Buy Entry -->
      <div class="gb-entry" onclick="App.go('group-buy')">
        <div class="gb-entry-left">
          <div class="gb-entry-icon">👥</div>
          <div>
            <div class="gb-entry-title">邻里拼团</div>
            <div class="gb-entry-desc">邻居一起买，更便宜</div>
          </div>
        </div>
        <div class="gb-entry-btn">去拼团</div>
      </div>

      <!-- Today Special -->
      ${special.length ? `
      <div class="home-section">
        <div class="home-section-head">
          <div class="section-title">今日特价</div>
          <span class="text-muted fs-12" onclick="HomePage.viewAll()">查看全部 ›</span>
        </div>
      </div>
      <div class="product-grid">
        ${special.slice(0, 4).map(p => productCardHtml(p)).join('')}
      </div>` : ''}

      <!-- Leader Recommend -->
      ${recommend.length ? `
      <div class="home-section">
        <div class="home-section-head">
          <div class="section-title">团长推荐</div>
          <span class="text-muted fs-12" onclick="HomePage.viewAll()">更多 ›</span>
        </div>
      </div>
      <div class="product-grid">
        ${recommend.slice(0, 4).map(p => productCardHtml(p)).join('')}
      </div>` : ''}

      <!-- All Products -->
      <div class="home-section">
        <div class="home-section-head">
          <div class="section-title">全部好物</div>
        </div>
      </div>
      <div class="product-grid">
        ${products.map(p => productCardHtml(p)).join('')}
      </div>

      <div style="text-align:center;padding:20px 0 30px;color:var(--color-muted);font-size:12px;">
        — 已经到底啦，去看看别的吧 —
      </div>
    `;

    // Start banner carousel
    startBannerCarousel();
  }

  function productCardHtml(p) {
    const soldOut = p.stock <= 0;
    const tags = (p.tags || []).slice(0, 2);
    return `
      <div class="product-card" onclick="HomePage.viewProduct(${p.id})">
        ${App.productImgHtml(p, (tags.length ? `<div class="product-tags">${tags.map(t => `<span class="product-tag ${App.tagClass(t)}">${App.tagLabel(t)}</span>`).join('')}</div>` : '') + (soldOut ? `<div class="product-soldout"><span>补货中</span></div>` : ''))}
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-spec">${p.spec || ''}</div>
          <div class="product-bottom">
            <div class="product-price">
              <span class="product-price-now">${App.fmtMoney(p.price)}</span>
              ${p.oldPrice ? `<span class="product-price-old">¥${App.fmtMoney(p.oldPrice)}</span>` : ''}
            </div>
            ${soldOut
              ? `<button class="add-btn disabled" onclick="event.stopPropagation()">+</button>`
              : `<button class="add-btn" onclick="event.stopPropagation();HomePage.quickAdd(${p.id})">+</button>`
            }
          </div>
          <div class="product-sales" style="margin-top:4px;">已售 ${p.sales}</div>
        </div>
      </div>
    `;
  }

  function startBannerCarousel() {
    const track = document.getElementById('banner-track');
    const dots = document.querySelectorAll('.banner-dot');
    if (!track) return;
    const slides = track.children.length;
    if (slides <= 1) return;

    clearInterval(bannerTimer);
    bannerTimer = setInterval(() => {
      bannerIndex = (bannerIndex + 1) % slides;
      track.style.transform = `translateX(-${bannerIndex * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === bannerIndex));
    }, 4000);

    // Click dots
    dots.forEach((d, i) => {
      d.onclick = () => {
        bannerIndex = i;
        track.style.transform = `translateX(-${bannerIndex * 100}%)`;
        dots.forEach((dd, ii) => dd.classList.toggle('active', ii === bannerIndex));
      };
    });
  }

  function quickAdd(productId) {
    const p = currentData.products.find(x => x.id === productId);
    if (!p) return;
    // If product has multiple specs, open product detail
    if (p.specs && p.specs.length > 1) {
      App.go('product/' + productId);
      return;
    }
    App.addToCart(productId, 1, p.specs && p.specs[0] ? p.specs[0].name : '');
  }

  function viewProduct(id) {
    API.trackEvent('product_click', { skuId: id });
    App.go('product/' + id);
  }

  function goCategory(catId) {
    App.state.selectedCategory = catId;
    App.go('category');
  }

  function viewAll() {
    App.go('category');
  }

  function openSearch() {
    App.go('search');
  }

  async function switchCommunity() {
    // 展示加载中
    App.showSheet('选择社区', `
      <div style="padding:0 16px 20px;">
        <div id="community-list-loading" style="text-align:center;padding:20px;color:var(--color-muted);">加载中...</div>
        <div id="community-list-body"></div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--color-line);">
          <button id="btn-locate" style="width:100%;padding:12px;border:1.5px solid var(--color-primary);border-radius:10px;background:#fff;color:var(--color-primary);font-size:14px;font-weight:600;">
            📍 自动定位当前位置
          </button>
        </div>
      </div>
    `);

    // 拉取真实社区列表
    let communities = [];
    try {
      const data = await API.getCommunities();
      communities = (data && data.list) || [];
    } catch (e) {
      communities = [];
    }
    if (communities.length === 0) {
      // fallback mock
      communities = [API.mock.COMMUNITY, { id: 2, name: '翠海花园', eta: 35, city: '深圳市南山区' }];
    }

    const loadingEl = document.getElementById('community-list-loading');
    if (loadingEl) loadingEl.remove();
    const bodyEl = document.getElementById('community-list-body');
    if (bodyEl) {
      bodyEl.innerHTML = communities.map(c => `
        <div class="cart-item" style="margin-bottom:8px;" onclick="HomePage.selectCommunity(${c.id})">
          <div class="cart-item-img bg-green">📍</div>
          <div class="cart-item-info">
            <div class="cart-item-name">${c.name}</div>
            <div class="cart-item-spec">${c.address || (c.city || '深圳市南山区')} · ${(c.eta || 30)}分钟达</div>
          </div>
          ${App.state.community && App.state.community.id === c.id ? '<span style="color:var(--color-success);font-size:20px;">✓</span>' : ''}
        </div>
      `).join('');
      // 缓存社区列表供选择
      HomePage._communities = communities;
    }

    // 绑定自动定位按钮
    const locateBtn = document.getElementById('btn-locate');
    if (locateBtn) {
      locateBtn.onclick = autoLocate;
    }
  }

  /**
   * 自动定位: GPS → IP定位 → 默认社区 三级降级
   * @param {boolean} silent - 静默模式(启动时调用), 不弹toast
   */
  async function autoLocate(silent) {
    // 判断是否为安全上下文 (HTTPS 或 localhost)
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isNonSecureHttp = !isSecure && location.protocol === 'http:';

    // 第1级: 浏览器 Geolocation (仅在安全上下文下尝试, HTTP非安全上下文下浏览器会阻止, 直接跳过)
    if (navigator.geolocation && isSecure) {
      if (!silent) App.toast('正在定位...');
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 });
        });
        await doLocate(pos.coords.latitude, pos.coords.longitude, false, silent);
        return;
      } catch (err) {
        // 用户拒绝授权或超时, 降级到IP定位
      }
    }

    // 第2级: IP定位 (直接从浏览器调用 ip-api.com, 避免Docker NAT导致服务端拿不到真实IP)
    if (!silent) App.toast('正在定位...');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const ipResp = await fetch('http://ip-api.com/json/?fields=status,message,lat,lon,city,regionName,country&lang=zh-CN', { signal: controller.signal });
      clearTimeout(timer);
      const ipJson = await ipResp.json();
      if (ipJson.status === 'success' && ipJson.lat && ipJson.lon) {
        await doLocate(ipJson.lat, ipJson.lon, false, silent, ipJson.city);
        return;
      }
    } catch (e) {
      // 客户端IP定位也失败, 尝试后端代理
      try {
        const ipResult = await API.ipLocate();
        if (ipResult && ipResult.latitude && ipResult.longitude && ipResult.source !== 'default') {
          await doLocate(ipResult.latitude, ipResult.longitude, false, silent, ipResult.city);
          return;
        }
      } catch (e2) {}
    }

    // 第3级: 默认坐标 (深圳南山)
    if (!silent) App.toast('定位不可用，已使用默认社区');
    await fallbackLocate(silent);
  }

  // 降级定位: 使用默认坐标调用后端匹配最近社区
  async function fallbackLocate(silent) {
    await doLocate(22.5431, 113.9465, true, silent);
  }

  async function doLocate(latitude, longitude, isFallback, silent, cityName) {
    try {
      const result = await API.locateCommunity(latitude, longitude);
      if (result && result.community) {
        const c = result.community;
        App.state.community = {
          id: c.id,
          name: c.name,
          address: c.address,
          latitude: c.latitude,
          longitude: c.longitude,
          eta: 30,
          distance: result.distance,
        };
        if (silent) {
          // 静默模式(app启动): 不弹toast, 不navigate, 让init()里的初始导航来渲染
          return;
        }
        if (!result.inRange) {
          App.toast('您附近暂未开通服务，已为您选择最近社区');
        } else if (!isFallback) {
          App.toast('已定位到 ' + (cityName ? cityName + ' · ' : '') + result.community.name);
        }
        App.closeSheet();
        App.navigate();
      } else {
        if (!silent) App.toast('未找到附近社区，请手动选择');
      }
    } catch (e) {
      // 后端也失败: 使用 mock 社区
      App.state.community = API.mock.COMMUNITY;
      if (silent) return;
      App.closeSheet();
      App.navigate();
      App.toast('定位服务异常，已使用默认社区');
    }
  }

  function selectCommunity(id) {
    const communities = HomePage._communities || [API.mock.COMMUNITY, { id: 2, name: '翠海花园', eta: 35, city: '深圳市南山区' }];
    const c = communities.find(x => x.id === id);
    if (c) {
      App.state.community = {
        id: c.id,
        name: c.name,
        address: c.address,
        latitude: c.latitude,
        longitude: c.longitude,
        eta: c.eta || 30,
      };
      // Persist community selection to backend (silently ignore errors)
      API.setUserCommunity(c.id).catch(() => {});
      App.closeSheet();
      App.toast('已切换至' + c.name);
      App.navigate();
    }
  }

  return { render, quickAdd, viewProduct, goCategory, viewAll, openSearch, switchCommunity, selectCommunity, autoLocate };
})();
