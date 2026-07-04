/* ==========================================================================
   邻里鲜生 · 搜索页
   ========================================================================== */
const SearchPage = (function () {
  const HOT_KEYWORDS = ['番茄', '苹果', '鸡蛋', '牛奶', '大米', '车厘子', '西兰花', '鲈鱼'];
  let searchTimer = null;
  let allProducts = [];

  async function render() {
    // Load all products for local search
    try {
      const res = await API.getProducts({ pageSize: 100 });
      allProducts = res.list || res || [];
    } catch (e) {
      allProducts = API.mock.PRODUCTS;
    }

    const history = getHistory();

    const html = `
      <div class="search-page">
        <div class="search-header">
          <div class="search-back" onclick="App.back()">‹</div>
          <div class="search-input-wrap">
            <span style="font-size:14px;opacity:0.5;">🔍</span>
            <input type="text" id="search-input" placeholder="搜索新鲜好物" autofocus />
          </div>
          <button class="search-btn" onclick="SearchPage.doSearch()">搜索</button>
        </div>

        <div id="search-body">
          ${history.length ? `
            <div class="search-history">
              <div class="search-history-header">
                <span>搜索历史</span>
                <span class="search-clear" onclick="SearchPage.clearHistory()">🗑 清除</span>
              </div>
              <div class="search-history-tags">
                ${history.map(h => `<span class="search-history-tag" onclick="SearchPage.quickSearch('${h}')">${h}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          <div class="search-hot">
            <div class="search-hot-title">🔥 热门搜索</div>
            <div class="search-hot-tags">
              ${HOT_KEYWORDS.map(k => `<span class="search-hot-tag" onclick="SearchPage.quickSearch('${k}')">${k}</span>`).join('')}
            </div>
          </div>

          <div class="home-section" style="padding:0 16px;">
            <div class="home-section-head">
              <div class="section-title">猜你喜欢</div>
            </div>
          </div>
          <div class="product-grid" id="search-suggest">
            ${allProducts.slice(0, 6).map(p => suggestCardHtml(p)).join('')}
          </div>
        </div>

        <div id="search-results" class="hidden"></div>
      </div>
    `;

    // Bind input event after render
    setTimeout(() => {
      const input = document.getElementById('search-input');
      if (input) {
        input.addEventListener('input', (e) => {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => {
            const val = e.target.value.trim();
            if (val) doSearch(val);
            else showSuggestions();
          }, 300);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSearch();
        });
      }
    }, 100);

    return html;
  }

  function suggestCardHtml(p) {
    return `
      <div class="product-card" onclick="App.go('product/${p.id}')">
        <div class="product-img">
          <div class="product-img-bg ${p.bg}"></div>
          <span class="product-img-emoji">${p.emoji}</span>
        </div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-spec">${p.spec || ''}</div>
          <div class="product-bottom">
            <div class="product-price">
              <span class="product-price-now">${App.fmtMoney(p.price)}</span>
            </div>
            <button class="add-btn" onclick="event.stopPropagation();App.addToCart(${p.id},1,'')">+</button>
          </div>
        </div>
      </div>
    `;
  }

  function doSearch(keyword) {
    const input = document.getElementById('search-input');
    const kw = keyword || (input ? input.value.trim() : '');
    if (!kw) return;

    // Save to history
    saveHistory(kw);

    // Search products
    const results = allProducts.filter(p =>
      p.name.includes(kw) ||
      (p.subtitle && p.subtitle.includes(kw)) ||
      (p.origin && p.origin.includes(kw))
    );

    // Hide suggestions, show results
    const body = document.getElementById('search-body');
    const resultsEl = document.getElementById('search-results');
    if (body) body.classList.add('hidden');
    if (resultsEl) resultsEl.classList.remove('hidden');

    if (results.length === 0) {
      // No results — show hot products
      resultsEl.innerHTML = `
        <div class="search-results">
          <div class="search-result-count">没有找到"${kw}"相关商品</div>
          <div class="home-section" style="padding:0;">
            <div class="home-section-head">
              <div class="section-title">为您推荐热销商品</div>
            </div>
          </div>
          <div class="product-grid">
            ${allProducts.filter(p => p.tags && p.tags.includes('hot')).slice(0, 4).map(p => suggestCardHtml(p)).join('')}
          </div>
        </div>
      `;
    } else {
      resultsEl.innerHTML = `
        <div class="search-results">
          <div class="search-result-count">找到 ${results.length} 件相关商品</div>
          <div class="product-grid">
            ${results.map(p => suggestCardHtml(p)).join('')}
          </div>
        </div>
      `;
    }
  }

  function showSuggestions() {
    const body = document.getElementById('search-body');
    const resultsEl = document.getElementById('search-results');
    if (body) body.classList.remove('hidden');
    if (resultsEl) resultsEl.classList.add('hidden');
  }

  function quickSearch(kw) {
    const input = document.getElementById('search-input');
    if (input) input.value = kw;
    doSearch(kw);
  }

  // ---- History helpers ----
  const HISTORY_KEY = 'linli_search_history';
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) { return []; }
  }
  function saveHistory(kw) {
    let hist = getHistory();
    hist = hist.filter(h => h !== kw);
    hist.unshift(kw);
    hist = hist.slice(0, 8);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  }
  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    App.navigate();
  }

  return { render, doSearch, quickSearch, clearHistory };
})();
