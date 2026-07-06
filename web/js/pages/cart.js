/* ==========================================================================
   邻里鲜生 · Cart Page
   ========================================================================== */

const CartPage = (function () {
  let cartItems = [];

  async function render() {
    try {
      cartItems = await API.getCart();
    } catch (e) {
      cartItems = App.state.cart;
    }

    if (!cartItems || cartItems.length === 0) {
      return `
        <div class="page cart-page">
          <div class="nav-header">
            <div class="nav-back" onclick="App.back()">‹</div>
            <div class="nav-title">购物车</div>
          </div>
          ${App.emptyState('🛒', '购物车是空的', '快去挑选新鲜好物吧', '去逛逛', "App.go('home')")}
        </div>
      `;
    }

    return `
      <div class="page cart-page">
        <div class="nav-header">
          <div class="nav-back" onclick="App.back()">‹</div>
          <div class="nav-title">购物车 (${cartItems.length})</div>
          <span class="text-muted fs-13" style="margin-right:32px;" onclick="CartPage.clearAll()">清空</span>
        </div>
        <div class="cart-list" id="cart-list">
          ${cartItems.map((item, idx) => cartItemHtml(item, idx)).join('')}
        </div>
        <div style="height:70px;"></div>
        <div class="cart-footer">
          <div class="cart-footer-check" onclick="CartPage.toggleAll()">
            <div class="cart-check ${allSelected() ? 'checked' : ''}" id="check-all">✓</div>
            <span>全选</span>
          </div>
          <div class="cart-footer-total">
            <div class="label">合计</div>
            <div class="amount" id="cart-total">${App.fmtMoney(getTotal())}</div>
          </div>
          <button class="btn btn-primary" id="checkout-btn" onclick="CartPage.checkout()">去结算(${getSelectedCount()})</button>
        </div>
      </div>
    `;
  }

  function cartItemHtml(item, idx) {
    const selected = item.selected !== false;
    return `
      <div class="cart-item" id="cart-item-${idx}">
        <div class="cart-check ${selected ? 'checked' : ''}" onclick="CartPage.toggleSelect(${idx})">✓</div>
        <div class="cart-item-img ${item.bg || 'bg-paper'}">${item.emoji || '📦'}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name || '商品'}</div>
          <div class="cart-item-spec">${item.spec || ''}</div>
          <div class="flex items-center justify-between">
            <span class="cart-item-price">${App.fmtMoney(item.price || 0)}</span>
            <div class="stepper">
              <button class="stepper-btn minus" onclick="CartPage.changeQty(${idx}, -1)">−</button>
              <span class="stepper-val">${item.quantity || 1}</span>
              <button class="stepper-btn" onclick="CartPage.changeQty(${idx}, 1)">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function allSelected() {
    return cartItems.length > 0 && cartItems.every(i => i.selected !== false);
  }

  function getSelectedCount() {
    return cartItems.filter(i => i.selected !== false).reduce((s, i) => s + (i.quantity || 0), 0);
  }

  function getTotal() {
    return cartItems.filter(i => i.selected !== false).reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  }

  async function toggleSelect(idx) {
    const item = cartItems[idx];
    const newSel = item.selected === false;
    try {
      await API.updateCart(item.id, undefined, newSel, item.spec);
    } catch (e) {}
    item.selected = newSel;
    App.state.cart = cartItems;
    updateView();
  }

  async function toggleAll() {
    const newSel = !allSelected();
    for (const item of cartItems) {
      item.selected = newSel;
      try { await API.updateCart(item.id, undefined, newSel, item.spec); } catch (e) {}
    }
    App.state.cart = cartItems;
    updateView();
  }

  async function changeQty(idx, delta) {
    const item = cartItems[idx];
    const newQty = (item.quantity || 1) + delta;
    if (newQty < 1) {
      // Remove
      await removeItem(idx);
      return;
    }
    if (newQty > (item.stock || 99)) {
      App.toast('库存不足');
      return;
    }
    try {
      await API.updateCart(item.id, newQty, undefined, item.spec);
    } catch (e) {}
    item.quantity = newQty;
    App.state.cart = cartItems;
    updateView();
  }

  async function removeItem(idx) {
    const item = cartItems[idx];
    if (!item) return;
    App.showModal({
      title: '移除商品',
      body: '确定要将该商品移出购物车吗？',
      cancelText: '取消',
      confirmText: '移除',
      onConfirm: async () => {
        try { await API.removeFromCart(item.id); } catch (e) {}
        cartItems.splice(idx, 1);
        App.state.cart = cartItems;
        App.updateCartFloat();
        if (cartItems.length === 0) {
          App.navigate();
        } else {
          updateView();
        }
        return true;
      },
    });
  }

  function updateView() {
    // Re-render the list and footer
    const list = document.getElementById('cart-list');
    if (list) {
      list.innerHTML = cartItems.map((item, idx) => cartItemHtml(item, idx)).join('');
    }
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.textContent = App.fmtMoney(getTotal());
    const checkAll = document.getElementById('check-all');
    if (checkAll) checkAll.classList.toggle('checked', allSelected());
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) checkoutBtn.textContent = `去结算(${getSelectedCount()})`;
    App.updateCartFloat();
  }

  function checkout() {
    const selected = cartItems.filter(i => i.selected !== false);
    if (selected.length === 0) {
      App.toast('请选择要结算的商品');
      return;
    }
    App.state.buyNowItem = null; // use cart items
    App.go('order-confirm');
  }

  function clearAll() {
    if (cartItems.length === 0) return;
    App.showModal({
      title: '清空购物车',
      body: '确定要清空购物车中的所有商品吗？',
      cancelText: '取消',
      confirmText: '清空',
      onConfirm: async () => {
        for (const item of cartItems) {
          try { await API.removeFromCart(item.id); } catch (e) {}
        }
        cartItems = [];
        App.state.cart = [];
        App.updateCartFloat();
        App.navigate();
        return true;
      },
    });
  }

  return { render, toggleSelect, toggleAll, changeQty, removeItem, checkout, clearAll };
})();
