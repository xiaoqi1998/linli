/* ==========================================================================
   邻里鲜生 · Product Detail Page
   ========================================================================== */

const ProductPage = (function () {
  let product = null;
  let selectedSpec = 0;
  let quantity = 1;
  let carouselIdx = 0;

  async function render(id) {
    try {
      product = await API.getProduct(id);
    } catch (e) {
      product = null;
    }
    // Fallback to mock data
    if (!product) {
      product = (API.mock && API.mock.PRODUCTS && API.mock.PRODUCTS.find(p => p.id == id)) || (API.mock && API.mock.PRODUCTS && API.mock.PRODUCTS[0]);
    }
    if (!product) {
      return `<div class="page"><div class="empty-state"><span class="empty-emoji">📦</span><p>商品不存在</p></div></div>`;
    }
    if (!product.reviews) product.reviews = (API.mock && API.mock.REVIEWS && API.mock.REVIEWS[id]) || [];
    if (!product.leader) product.leader = { name: '李团长', avatar: '👩‍🌾', text: '我家孩子吃了三箱了，真的甜！品质放心。' };

    selectedSpec = 0;
    quantity = 1;
    carouselIdx = 0;

    const p = product;
    const tags = p.tags || [];
    const specs = p.specs || [{ name: p.spec, price: p.price }];
    const curPrice = specs[selectedSpec] ? specs[selectedSpec].price : p.price;
    const reviews = p.reviews || [];
    const leader = p.leader;

    let detailImgs = p.detailImages || p.detail_images || [];
    if (typeof detailImgs === 'string') {
      try { detailImgs = JSON.parse(detailImgs); } catch (e) { detailImgs = []; }
    }
    const detailImgCount = Array.isArray(detailImgs) ? (detailImgs.length || 2) : 2;

    return `
      <div class="nav-header">
        <div class="nav-back" onclick="App.back()">‹</div>
        <div class="nav-title">商品详情</div>
      </div>

      <!-- Image Carousel -->
      <div class="pd-carousel" id="pd-carousel">
        <div class="pd-carousel-track" id="pd-track">
          <div class="pd-carousel-slide"><div class="${p.bg}" style="position:absolute;inset:0;"></div><span class="pd-img-emoji">${p.emoji}</span></div>
          ${Array.from({ length: detailImgCount - 1 }, (_, i) =>
            `<div class="pd-carousel-slide"><div class="${p.bg}" style="position:absolute;inset:0;opacity:0.7;"></div><span class="pd-img-emoji" style="font-size:90px;">${p.emoji}</span></div>`
          ).join('')}
        </div>
        <div class="pd-carousel-dots" id="pd-dots">
          ${Array.from({ length: detailImgCount }, (_, i) => `<div class="banner-dot ${i === 0 ? 'active' : ''}"></div>`).join('')}
        </div>
      </div>

      <!-- Product Info -->
      <div class="pd-info">
        <div class="pd-price-row">
          <span class="pd-price-now" id="pd-price">${App.fmtMoney(curPrice)}</span>
          ${p.oldPrice ? `<span class="pd-price-old">¥${App.fmtMoney(p.oldPrice)}</span>` : ''}
          ${tags.includes('special') ? '<span class="pd-price-tag">今日特价</span>' : ''}
        </div>
        <div class="pd-name">${p.name}</div>
        <div class="pd-meta">
          <span class="pd-meta-item">📦 已售${p.sales}</span>
          <span class="pd-meta-item">📍 ${p.origin || '产地直采'}</span>
          <span class="pd-meta-item">❄️ ${p.storage || '常温'}</span>
          <span class="pd-meta-item" style="color:var(--color-success);">✓ 库存${p.stock}件</span>
        </div>
      </div>

      <!-- Spec Selection -->
      ${specs.length > 1 ? `
      <div class="pd-section">
        <div class="section-title" style="margin-bottom:14px;">规格选择</div>
        <div class="pd-spec-row" id="pd-specs">
          ${specs.map((s, i) => `
            <div class="pd-spec-chip ${i === selectedSpec ? 'active' : ''}" data-idx="${i}" onclick="ProductPage.selectSpec(${i})">
              ${s.name} ¥${App.fmtMoney(s.price)}
            </div>
          `).join('')}
        </div>
      </div>` : ''}

      <!-- Leader Recommendation -->
      ${leader ? `
      <div class="pd-section">
        <div class="section-title" style="margin-bottom:14px;">团长推荐</div>
        <div class="pd-leader">
          <div class="pd-leader-avatar">${leader.avatar}</div>
          <div class="pd-leader-info">
            <div class="pd-leader-name">${leader.name} <span class="pd-leader-tag">本社区团长</span></div>
            <div class="pd-leader-text">"${leader.text}"</div>
          </div>
        </div>
      </div>` : ''}

      <!-- Reviews -->
      <div class="pd-section">
        <div class="section-title" style="margin-bottom:4px;">邻居评价 (${reviews.length})</div>
        ${reviews.length ? reviews.slice(0, 3).map(r => `
          <div class="review-item">
            <div class="review-head">
              <div class="review-avatar bg-gold">${r.avatar}</div>
              <span class="review-name">${r.name}</span>
              <span class="review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
            </div>
            <div class="review-text">${r.text}</div>
            <div class="text-muted fs-12" style="margin-top:4px;">${r.date}</div>
          </div>
        `).join('') : '<div class="empty-state" style="padding:30px;"><div class="empty-emoji">📝</div><div class="empty-desc">暂无评价</div></div>'}
      </div>

      <!-- Product Detail -->
      <div class="pd-section">
        <div class="section-title" style="margin-bottom:14px;">商品详情</div>
        <div style="font-size:13px;color:var(--color-text);line-height:1.8;">
          <p>${p.subtitle || ''}</p>
          <p style="margin-top:8px;">产地：${p.origin || '—'}</p>
          <p>规格：${p.spec || '—'}</p>
          <p>储存方式：${p.storage || '常温'}</p>
          <p style="margin-top:8px;color:var(--color-muted);">所有商品均由本社区前置仓直发，30分钟极速送达。团长精选好货，品质有保障，收到不满意可申请售后。</p>
        </div>
      </div>

      <!-- Related / Buy again -->
      <div class="pd-section">
        <div class="section-title" style="margin-bottom:14px;">买过的人还买了</div>
        <div style="display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px;">
          ${(await getRelated(p)).map(rp => `
            <div class="product-card" style="min-width:130px;flex-shrink:0;" onclick="App.go('product/${rp.id}')">
              <div class="product-img" style="aspect-ratio:1/1;">
                <div class="product-img-bg ${rp.bg}"></div>
                <span class="product-img-emoji" style="font-size:40px;">${rp.emoji}</span>
              </div>
              <div class="product-body" style="padding:8px;">
                <div class="product-name" style="font-size:12px;min-height:32px;">${rp.name}</div>
                <div class="product-price-now" style="font-size:15px;">${App.fmtMoney(rp.price)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="height:70px;"></div>

      <!-- Action Bar -->
      <div class="pd-action-bar" style="position:fixed;bottom:0;left:0;right:0;z-index:100;background:#fff;border-top:1px solid var(--color-line);padding:8px 16px max(8px, env(safe-area-inset-bottom));display:flex;align-items:center;gap:10px;">
        <div class="pd-action-icons" style="display:flex;gap:16px;padding:0 8px;">
          <div class="pd-action-icon" style="display:flex;flex-direction:column;align-items:center;font-size:20px;cursor:pointer;" onclick="App.go('home')">🏠<span style="font-size:10px;color:var(--color-muted);">首页</span></div>
          <div class="pd-action-icon" style="display:flex;flex-direction:column;align-items:center;font-size:20px;cursor:pointer;" onclick="App.go('cart')">🛒<span style="font-size:10px;color:var(--color-muted);">购物车</span></div>
        </div>
        <div class="pd-action-btns" style="flex:1;display:flex;gap:8px;">
          <button class="btn btn-dark" style="flex:1;height:42px;border-radius:var(--radius-btn-sm);font-size:14px;font-weight:600;" onclick="ProductPage.openSpecSheet('cart')">加入购物车</button>
          <button class="btn btn-primary" style="flex:1;height:42px;border-radius:var(--radius-btn-sm);font-size:14px;font-weight:600;" onclick="ProductPage.openSpecSheet('buy')">立即购买</button>
        </div>
      </div>
    `;
  }

  async function getRelated(product) {
    try {
      const res = await API.getProducts({ pageSize: 100 });
      const all = Array.isArray(res) ? res : (res.list || []);
      // Get products from same category, exclude current
      let related = all.filter(p => p.categoryId === product.categoryId && p.id !== product.id);
      if (related.length < 4) {
        // Fill with other products
        const others = all.filter(p => p.id !== product.id && p.categoryId !== product.categoryId);
        related = [...related, ...others];
      }
      return related.slice(0, 6);
    } catch (e) {
      return API.mock.PRODUCTS.filter(p => p.categoryId === product.categoryId && p.id !== product.id).slice(0, 6);
    }
  }

  function selectSpec(idx) {
    selectedSpec = idx;
    const specs = product.specs || [];
    const curPrice = specs[idx] ? specs[idx].price : product.price;
    document.getElementById('pd-price').textContent = App.fmtMoney(curPrice);
    document.querySelectorAll('#pd-specs .pd-spec-chip').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
  }

  function openSpecSheet(action) {
    const p = product;
    const specs = p.specs || [{ name: p.spec, price: p.price }];
    const curSpec = specs[selectedSpec];
    const curPrice = curSpec ? curSpec.price : p.price;

    App.showSheet(action === 'buy' ? '立即购买' : '加入购物车', `
      <div class="spec-sheet-content">
        <div class="spec-product">
          <div class="spec-product-img ${p.bg}">${p.emoji}</div>
          <div class="spec-product-info">
            <div class="spec-product-name">${p.name}</div>
            <div class="spec-product-price" id="spec-price">${App.fmtMoney(curPrice)}</div>
            <div class="spec-product-stock">库存 ${p.stock}件 · ${p.origin || ''}</div>
          </div>
        </div>
        ${specs.length > 1 ? `
        <div class="spec-group">
          <div class="spec-group-title">规格</div>
          <div class="spec-options" id="spec-options">
            ${specs.map((s, i) => `
              <div class="spec-opt ${i === selectedSpec ? 'active' : ''}" data-idx="${i}" onclick="ProductPage.sheetSpec(${i})">${s.name}</div>
            `).join('')}
          </div>
        </div>` : ''}
        <div class="spec-group">
          <div class="spec-qty">
            <span class="spec-group-title" style="margin:0;">数量</span>
            <div class="stepper">
              <button class="stepper-btn minus" onclick="ProductPage.sheetQty(-1)">−</button>
              <span class="stepper-val" id="spec-qty">1</span>
              <button class="stepper-btn" onclick="ProductPage.sheetQty(1)">+</button>
            </div>
          </div>
        </div>
      </div>
      <div class="spec-footer">
        <button class="btn ${action === 'buy' ? 'btn-primary' : 'btn-dark'} btn-block" onclick="ProductPage.confirmSpec('${action}')">${action === 'buy' ? '立即购买' : '加入购物车'}</button>
      </div>
    `);
  }

  function sheetSpec(idx) {
    selectedSpec = idx;
    const specs = product.specs || [];
    const curPrice = specs[idx] ? specs[idx].price : product.price;
    document.getElementById('spec-price').textContent = App.fmtMoney(curPrice);
    document.querySelectorAll('#spec-options .spec-opt').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
  }

  function sheetQty(delta) {
    quantity = Math.max(1, Math.min(product.stock, quantity + delta));
    document.getElementById('spec-qty').textContent = quantity;
  }

  async function confirmSpec(action) {
    const specs = product.specs || [{ name: product.spec, price: product.price }];
    const curSpec = specs[selectedSpec];
    const specName = curSpec ? curSpec.name : '';

    if (action === 'cart') {
      App.closeSheet();
      await App.addToCart(product.id, quantity, specName);
    } else {
      // Buy now: set buyNowItem and go to order confirm
      App.state.buyNowItem = {
        id: product.id,
        name: product.name,
        emoji: product.emoji,
        bg: product.bg,
        spec: specName,
        price: curSpec ? curSpec.price : product.price,
        quantity: quantity,
      };
      App.closeSheet();
      App.go('order-confirm');
    }
  }

  return { render, selectSpec, openSpecSheet, sheetSpec, sheetQty, confirmSpec };
})();
