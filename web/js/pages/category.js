/* ==========================================================================
   邻里鲜生 · 分类页
   ========================================================================== */
const CategoryPage = (function () {
  // Cache fetched data so selectCat can reuse it without re-fetching
  let fetchedCategories = [];
  let fetchedProducts = [];

  // Category name → emoji mapping (API returns icon as URL, we need emoji chars)
  const CAT_EMOJI_MAP = {
    '蔬菜': '🥬', '水果': '🍎', '肉禽蛋': '🥚', '水产': '🐟',
    '粮油调味': '🍚', '乳制品': '🥛', '零食饮料': '🥤', '日用百货': '🧻',
  };
  const CAT_BG_MAP = {
    '蔬菜': 'bg-veg', '水果': 'bg-fruit', '肉禽蛋': 'bg-meat', '水产': 'bg-sea',
    '粮油调味': 'bg-grain', '乳制品': 'bg-milk', '零食饮料': 'bg-snack', '日用百货': 'bg-daily',
  };

  // Normalize category fields: the real API returns {id, name, icon, sort_order},
  // while the UI expects {id, name, emoji, bg}. Use name→emoji mapping.
  function normalizeCategory(c) {
    return {
      id: c.id,
      name: c.name,
      emoji: c.emoji || CAT_EMOJI_MAP[c.name] || '🛒',
      bg: c.bg || CAT_BG_MAP[c.name] || '',
    };
  }

  async function render() {
    let categories = [];
    let products = [];
    try {
      categories = await API.getCategories();
      // Handle response format (array or {list: [...]})
      if (!Array.isArray(categories)) categories = categories.list || [];
    } catch (e) {
      categories = API.mock.CATEGORIES;
    }
    try {
      const res = await API.getProducts({ pageSize: 100 });
      // Products are already transformed by API.getProducts()
      products = Array.isArray(res) ? res : (res.list || []);
    } catch (e) {
      products = API.mock.PRODUCTS;
    }

    // Normalize category fields so the UI can rely on emoji/name
    categories = categories.map(normalizeCategory);

    // Cache for later use by selectCat
    fetchedCategories = categories;
    fetchedProducts = products;

    const currentCat = categories[0] ? categories[0].id : 1;

    let html = `
      <div class="page category-page">
        <div class="cat-search-bar">
          <div class="search-bar" onclick="App.go('search')">
            <span class="search-icon">🔍</span>
            <span class="search-input" style="color:var(--color-muted)">搜索商品</span>
          </div>
        </div>
        <div class="cat-page-container">
          <div class="cat-page">
            <div class="cat-sidebar">
              ${categories.map((c, i) => `
                <div class="cat-side-item ${i === 0 ? 'active' : ''}" data-cat="${c.id}" onclick="CategoryPage.selectCat(${c.id}, this)">
                  <span class="cat-side-emoji">${c.emoji}</span>
                  <span class="cat-side-name">${c.name}</span>
                </div>
              `).join('')}
            </div>
            <div class="cat-content" id="cat-content">
              ${renderProducts(currentCat, products, categories)}
            </div>
          </div>
        </div>
      </div>
    `;
    return html;
  }

  function renderProducts(catId, products, cats) {
    const filtered = products.filter(p => p.categoryId === catId);
    const cat = cats.find(c => c.id === catId);
    let html = `<div class="cat-header"><h3>${cat.emoji} ${cat.name}</h3><span class="cat-count">${filtered.length}件</span></div>`;
    if (!filtered.length) {
      html += '<div class="empty-state"><span class="empty-emoji">📦</span><p>该分类暂无商品</p></div>';
      return html;
    }
    html += '<div class="product-grid">';
    filtered.forEach(p => {
      html += App.renderProductCard(p);
    });
    html += '</div>';
    return html;
  }

  function selectCat(catId, el) {
    document.querySelectorAll('.cat-side-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    // Use the cached real data; fall back to mock if not yet loaded
    const products = fetchedProducts.length ? fetchedProducts : API.mock.PRODUCTS;
    const cats = fetchedCategories.length ? fetchedCategories : API.mock.CATEGORIES;
    document.getElementById('cat-content').innerHTML = renderProducts(catId, products, cats);
  }

  return { render, selectCat };
})();
