/* ==========================================================================
   邻里鲜生 · Order Confirm Page
   ========================================================================== */

const OrderConfirmPage = (function () {
  let items = [];
  let address = null;
  let addresses = [];
  let coupons = [];
  let selectedCoupon = null;
  let deliveryType = 1; // 1=尽快 2=预约
  let remark = '';

  async function render() {
    // Determine items source: buy-now or cart selected
    if (App.state.buyNowItem) {
      items = [App.state.buyNowItem];
    } else {
      try {
        const cart = await API.getCart();
        items = cart.filter(i => i.selected !== false);
      } catch (e) {
        items = App.state.cart.filter(i => i.selected !== false);
      }
    }

    if (items.length === 0) {
      return App.emptyState('📦', '没有可结算的商品', '请先选择商品', '去逛逛', "App.go('home')");
    }

    // Load addresses and coupons
    try { addresses = await API.getAddresses(); } catch (e) { addresses = API.mock.ADDRESSES; }
    try { coupons = await API.getAvailableCoupons(); } catch (e) { coupons = API.mock.COUPONS; }

    address = addresses.find(a => a.isDefault) || addresses[0] || null;

    // Auto-select best coupon
    const skuTotal = getSkuTotal();
    selectedCoupon = findBestCoupon(skuTotal);

    return `
      <div class="page order-confirm-page">
      <div class="nav-header">
        <div class="nav-back" onclick="App.back()">‹</div>
        <div class="nav-title">确认订单</div>
      </div>

      <!-- Address -->
      <div style="height:12px;"></div>
      <div class="oc-section" onclick="OrderConfirmPage.selectAddress()" style="cursor:pointer;">
        ${address ? `
          <div class="oc-address">
            <div class="oc-address-icon">📍</div>
            <div class="oc-address-info">
              <div class="oc-address-name">${address.name || address.contact_name || ''}<span class="phone">${address.phone || address.contact_phone || ''}</span></div>
              <div class="oc-address-detail">${(address.tag || (address.isDefault ? '默认' : '')) ? `<span class="address-tag">${address.tag || (address.isDefault ? '默认' : '')}</span>` : ''}${address.detail || address.detail_address || ''}</div>
            </div>
            <div class="oc-arrow">›</div>
          </div>
        ` : `
          <div class="oc-address">
            <div class="oc-address-icon">📍</div>
            <div class="oc-address-info">
              <div style="font-size:15px;font-weight:600;">请添加收货地址</div>
              <div class="oc-address-detail">点击此处新增地址</div>
            </div>
            <div class="oc-arrow">›</div>
          </div>
        `}
      </div>

      <!-- Delivery Time -->
      <div class="oc-section">
        <div class="section-title" style="margin-bottom:12px;">配送时间</div>
        <div class="oc-delivery">
          <div class="oc-delivery-opt ${deliveryType === 1 ? 'active' : ''}" onclick="OrderConfirmPage.selectDelivery(1)">
            <div class="oc-delivery-opt-title">尽快送达</div>
            <div class="oc-delivery-opt-desc">预计${getEta()}前送达</div>
          </div>
          <div class="oc-delivery-opt ${deliveryType === 2 ? 'active' : ''}" onclick="OrderConfirmPage.selectDelivery(2)">
            <div class="oc-delivery-opt-title">预约配送</div>
            <div class="oc-delivery-opt-desc">选择送达时段</div>
          </div>
        </div>
      </div>

      <!-- Items -->
      <div class="oc-section">
        <div class="section-title" style="margin-bottom:4px;">商品清单 (${items.length})</div>
        ${items.map(item => `
          <div class="oc-item">
            <div class="oc-item-img ${item.bg || 'bg-paper'}">${item.emoji || '📦'}</div>
            <div class="oc-item-info">
              <div class="oc-item-name">${item.name}</div>
              <div class="oc-item-spec">${item.spec || ''}</div>
            </div>
            <div class="oc-item-price">
              <div class="p">¥${App.fmtMoney(item.price)}</div>
              <div class="q">x${item.quantity}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Coupon -->
      <div class="oc-section" onclick="OrderConfirmPage.selectCoupon()" style="cursor:pointer;">
        <div class="oc-row">
          <span class="label">优惠券</span>
          <span class="oc-coupon">
            ${selectedCoupon ? `${selectedCoupon.name} (-¥${App.fmtMoney(getCouponDiscount())})` : (coupons.length ? '有可用券' : '无可用券')}
            <span style="color:var(--color-muted);">›</span>
          </span>
        </div>
      </div>

      <!-- Remark -->
      <div class="oc-section">
        <div class="oc-row" style="border-bottom:none;">
          <span class="label">订单备注</span>
        </div>
        <input type="text" class="oc-remark" id="oc-remark" placeholder="给团长留言，如'请帮我把鸡蛋装结实一点'" maxlength="50" value="${remark}" oninput="OrderConfirmPage.setRemark(this.value)" />
      </div>

      <!-- Amount Breakdown -->
      <div class="oc-breakdown">
        <div class="oc-row">
          <span class="label">商品小计</span>
          <span class="value">¥${App.fmtMoney(getSkuTotal())}</span>
        </div>
        <div class="oc-row">
          <span class="label">配送费</span>
          <span class="value">${getDeliveryFee() === 0 ? '<span style="color:var(--color-success);">免配送费</span>' : '¥' + App.fmtMoney(getDeliveryFee())}</span>
        </div>
        ${getCouponDiscount() > 0 ? `
        <div class="oc-row">
          <span class="label">优惠券抵扣</span>
          <span class="value" style="color:var(--color-accent);">-¥${App.fmtMoney(getCouponDiscount())}</span>
        </div>` : ''}
        <div class="oc-total-row">
          <span class="label">实付金额</span>
          <span class="amount" id="oc-pay-amount">${App.fmtMoney(getPayAmount())}</span>
        </div>
      </div>

      <div style="height:80px;"></div>

      <!-- Submit Bar -->
      <div class="oc-submit-bar">
        <div>
          <div style="font-size:12px;color:var(--color-muted);">实付</div>
          <div style="font-size:22px;font-weight:900;color:var(--color-accent);">¥${App.fmtMoney(getPayAmount())}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline btn-lg" onclick="OrderConfirmPage.submit(true)" style="font-size:14px;padding:10px 16px;">找人代付</button>
          <button class="btn btn-primary btn-lg" onclick="OrderConfirmPage.submit(false)">提交订单</button>
        </div>
      </div>
      </div>
    `;
  }

  function getSkuTotal() {
    return items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  }

  function getDeliveryFee() {
    const total = getSkuTotal();
    if (selectedCoupon && selectedCoupon.type === 3) return 0; // free delivery coupon
    return total >= 29 ? 0 : 3;
  }

  function getCouponDiscount() {
    if (!selectedCoupon) return 0;
    if (selectedCoupon.type === 1) return selectedCoupon.faceValue;
    if (selectedCoupon.type === 2) return getSkuTotal() * (1 - selectedCoupon.faceValue);
    return 0;
  }

  function getPayAmount() {
    const total = getSkuTotal() + getDeliveryFee() - getCouponDiscount();
    return Math.max(0, total);
  }

  function getEta() {
    const now = new Date(Date.now() + 30 * 60000);
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }

  function findBestCoupon(skuTotal) {
    const valid = coupons.filter(c => {
      if (c.type === 3) return true; // free delivery always "valid" but lower priority
      return skuTotal >= (c.minOrder || 0);
    });
    if (!valid.length) return null;
    // Sort by discount amount descending, prefer满减 over免配送
    valid.sort((a, b) => {
      const da = a.type === 1 ? a.faceValue : (a.type === 3 ? 3 : 0);
      const db = b.type === 1 ? b.faceValue : (b.type === 3 ? 3 : 0);
      return db - da;
    });
    return valid[0];
  }

  function selectDelivery(type) {
    deliveryType = type;
    document.querySelectorAll('.oc-delivery-opt').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === type);
    });
  }

  function selectAddress() {
    if (addresses.length === 0) {
      App.go('address-edit/0');
      return;
    }
    const html = addresses.map(a => `
      <div class="cart-item" style="margin:0 16px 8px;cursor:pointer;" onclick="OrderConfirmPage.setAddress(${a.id})">
        <div class="cart-item-img bg-green">📍</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${a.name || a.contact_name || ''} <span style="font-weight:400;color:var(--color-muted);">${a.phone || a.contact_phone || ''}</span></div>
          <div class="cart-item-spec">${(a.tag || (a.isDefault ? '默认' : '')) ? '<span class="address-tag">' + (a.tag || (a.isDefault ? '默认' : '')) + '</span>' : ''}${a.detail || a.detail_address || ''}</div>
        </div>
        ${address && address.id === a.id ? '<span style="color:var(--color-success);font-size:18px;">✓</span>' : ''}
      </div>
    `).join('') + `
      <div style="padding:0 16px 20px;">
        <button class="btn btn-ghost btn-block" onclick="App.closeSheet();App.go('address-edit/0')">+ 新增地址</button>
      </div>
    `;
    App.showSheet('选择收货地址', html);
  }

  function setAddress(id) {
    address = addresses.find(a => a.id === id);
    App.closeSheet();
    App.navigate();
  }

  function selectCoupon() {
    const skuTotal = getSkuTotal();
    const html = `
      <div style="padding:0 0 20px;">
        ${coupons.length ? coupons.map(c => {
          const usable = c.type === 3 || skuTotal >= (c.minOrder || 0);
          const isSel = selectedCoupon && selectedCoupon.userCouponId === c.userCouponId;
          return `
            <div class="coupon-card ${usable ? '' : 'disabled'}" style="cursor:pointer;margin:0 16px 10px;" onclick="${usable ? `OrderConfirmPage.setCoupon(${c.userCouponId})` : ''}">
              <div class="coupon-left">
                ${c.type === 3 ? '<div class="coupon-amount" style="font-size:14px;">免运费</div>' : `<div class="coupon-amount">${c.faceValue}</div>`}
                <div class="coupon-label">${c.desc}</div>
              </div>
              <div class="coupon-right">
                <div class="coupon-name">${c.name} ${isSel ? '✓' : ''}</div>
                <div class="coupon-desc">${usable ? '可用' : '未达门槛'}</div>
                <div class="coupon-date">有效期至 ${c.validEnd}</div>
              </div>
            </div>
          `;
        }).join('') : '<div class="empty-state" style="padding:40px;"><div class="empty-emoji">🎫</div><div class="empty-desc">暂无可用优惠券</div></div>'}
        <div style="padding:0 16px;">
          <button class="btn btn-ghost btn-block" onclick="OrderConfirmPage.setCoupon(0)">不使用优惠券</button>
        </div>
      </div>
    `;
    App.showSheet('选择优惠券', html);
  }

  function setCoupon(userCouponId) {
    if (userCouponId === 0) {
      selectedCoupon = null;
    } else {
      selectedCoupon = coupons.find(c => c.userCouponId === userCouponId);
    }
    App.closeSheet();
    App.navigate();
  }

  function setRemark(val) {
    remark = val;
  }

  async function submit(useProxyPay) {
    if (!address) {
      App.toast('请选择收货地址');
      return;
    }
    if (items.length === 0) {
      App.toast('请选择商品');
      return;
    }

    const orderData = {
      items: items.map(i => ({
        skuId: i.id,
        quantity: i.quantity,
        specId: i.specId || i.skuSpecId || (i.spec && typeof i.spec === 'object' ? i.spec.id : null) || null,
      })),
      addressId: address.id,
      deliveryTimeType: deliveryType,
      deliveryTimeSlot: deliveryType === 1 ? null : '预约配送',
      couponId: selectedCoupon ? selectedCoupon.userCouponId : null,
      remark: remark,
      cartItemIds: items.map(i => i.cartItemId).filter(Boolean),
    };

    try {
      const order = await API.createOrder(orderData);
      App.toast('订单创建成功');
      // Clear buy-now item
      App.state.buyNowItem = null;
      // 刷新购物车 (后端已清空，前端同步刷新)
      await App.refreshCart();

      if (useProxyPay) {
        // 找人代付: 生成代付链接, 跳转订单详情让用户分享代付链接
        try {
          const proxy = await API.reqProxyPay(order.orderNo);
          // 跳转订单详情, 并弹出代付链接
          App.go('order-detail/' + order.orderNo + '?proxy=' + encodeURIComponent(proxy.token));
        } catch (e2) {
          App.toast('代付链接生成失败，可稍后在订单中发起');
          App.go('order-detail/' + order.orderNo);
        }
        return;
      }

      // 调用支付接口 (Demo: 默认支付成功)
      try {
        await API.payOrder(order.orderNo);
      } catch (payErr) {
        // 支付失败仍跳转订单详情，让用户可手动支付
        console.error('支付失败:', payErr);
        App.go('order-detail/' + order.orderNo);
        return;
      }

      // 支付成功，跳转支付成功页
      App.go('pay-success/' + order.orderNo);
    } catch (e) {
      App.toast('下单失败，请重试');
    }
  }

  return { render, selectDelivery, selectAddress, setAddress, selectCoupon, setCoupon, setRemark, submit };
})();
