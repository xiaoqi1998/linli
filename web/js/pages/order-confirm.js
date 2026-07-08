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
  let deliveryTimeSlot = null; // 预约时段, 如 "今天 14:00-14:30"
  let remark = '';
  let submitting = false; // 防重复提交锁

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
            <div class="oc-delivery-opt-desc">${deliveryTimeSlot || '选择送达时段'}</div>
          </div>
        </div>
      </div>

      <!-- Items -->
      <div class="oc-section">
        <div class="section-title" style="margin-bottom:4px;">商品清单 (${items.length})</div>
        ${items.map(item => `
          <div class="oc-item">
            <div class="oc-item-img ${item.bg || 'bg-paper'}">${item.image || item.mainImage ? `<img src="${item.image || item.mainImage}" onerror="this.outerHTML='<span>${item.emoji || '📦'}</span>'">` : (item.emoji || '📦')}</div>
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
    if (selectedCoupon.type === 2) {
      // face_value 是折扣率: 0.9 表示9折; 兼容数据库可能存的整数(9 表示9折)
      let rate = selectedCoupon.faceValue;
      if (rate > 1) rate = rate / 10; // 9 → 0.9
      return getSkuTotal() * (1 - rate);
    }
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
    // 选择预约配送时弹出时间选择器
    if (type === 2) {
      showTimeSlotPicker();
    }
  }

  // 生成可选时间段 (30分钟粒度, 今天剩余 + 明天 08:00-22:00)
  function generateTimeSlots() {
    const slots = [];
    const now = new Date();
    const today = new Date(now);
    const tomorrow = new Date(now.getTime() + 86400000);

    // 今天: 从下一个 30 分钟整点开始, 到 22:00
    let t = new Date(today);
    t.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
    if (t <= now) t = new Date(t.getTime() + 30 * 60000);
    const todayEnd = new Date(today);
    todayEnd.setHours(22, 0, 0, 0);
    while (t < todayEnd) {
      const e = new Date(t.getTime() + 30 * 60000);
      slots.push({
        label: '今天',
        value: `今天 ${fmt(t)}-${fmt(e)}`,
        text: `${fmt(t)}-${fmt(e)}`,
      });
      t = e;
    }

    // 明天: 08:00-22:00
    let m = new Date(tomorrow);
    m.setHours(8, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(22, 0, 0, 0);
    while (m < tomorrowEnd) {
      const e = new Date(m.getTime() + 30 * 60000);
      slots.push({
        label: '明天',
        value: `明天 ${fmt(m)}-${fmt(e)}`,
        text: `${fmt(m)}-${fmt(e)}`,
      });
      m = e;
    }

    return slots;
  }

  function fmt(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function showTimeSlotPicker() {
    const slots = generateTimeSlots();
    if (slots.length === 0) {
      App.toast('暂无可选时段, 请选择尽快送达');
      selectDelivery(1);
      return;
    }
    const html = `
      <div style="padding:0 0 20px;">
        <div style="padding:12px 16px 8px;font-size:13px;color:var(--color-muted);">选择送达时段 (30分钟粒度)</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 16px;">
          ${slots.map((s, i) => `
            <div class="oc-timeslot ${deliveryTimeSlot === s.value ? 'active' : ''}" style="padding:10px 6px;text-align:center;border:1.5px solid ${deliveryTimeSlot === s.value ? 'var(--color-primary)' : 'var(--color-line)'};border-radius:8px;cursor:pointer;font-size:12px;background:${deliveryTimeSlot === s.value ? 'var(--color-primary)' : 'transparent'};color:${deliveryTimeSlot === s.value ? '#fff' : 'inherit'};" onclick="OrderConfirmPage.setTimeSlot('${s.value.replace(/'/g, "\\'")}')">
              <div style="font-size:10px;opacity:0.8;">${s.label}</div>
              <div style="font-weight:600;">${s.text}</div>
            </div>
          `).join('')}
        </div>
        <div style="padding:12px 16px 0;">
          <button class="btn btn-ghost btn-block" onclick="App.closeSheet()">取消</button>
        </div>
      </div>
    `;
    App.showSheet('选择送达时段', html);
  }

  function setTimeSlot(slot) {
    deliveryTimeSlot = slot;
    App.closeSheet();
    App.navigate();
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
    // 局部更新地址区域，避免重新渲染导致备注/配送时间等输入丢失
    updateAddressView();
    updatePriceView();
  }

  function updateAddressView() {
    const addrEl = document.querySelector('.oc-address-card, [data-addr-section]');
    if (addrEl && address) {
      addrEl.outerHTML = `
        <div class="oc-address-card" data-addr-section style="cursor:pointer;" onclick="OrderConfirmPage.selectAddress()">
          <div class="addr-icon">📍</div>
          <div class="addr-info">
            <div class="addr-name">${address.name || ''} ${address.phone || ''}</div>
            <div class="addr-detail">${address.address || ''}${address.houseNumber ? ' ' + address.houseNumber : ''}</div>
          </div>
          <div class="addr-arrow">›</div>
        </div>`;
    }
  }

  function updatePriceView() {
    const priceEl = document.querySelector('.oc-price-summary');
    if (priceEl) {
      const skuTotal = getSkuTotal();
      const deliveryFee = getDeliveryFee();
      const discount = getDiscount();
      const payAmount = Math.max(0, skuTotal + deliveryFee - discount);
      priceEl.innerHTML = `
        <div class="price-row"><span>商品金额</span><span>¥${skuTotal.toFixed(2)}</span></div>
        <div class="price-row"><span>配送费</span><span>${deliveryFee > 0 ? '¥' + deliveryFee.toFixed(2) : '免配送费'}</span></div>
        ${discount > 0 ? `<div class="price-row discount"><span>优惠</span><span>-¥${discount.toFixed(2)}</span></div>` : ''}
        <div class="price-row total"><span>实付</span><span class="price-total">¥${payAmount.toFixed(2)}</span></div>`;
    }
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
    // 局部更新价格区域，避免重新渲染导致备注/配送时间等输入丢失
    updatePriceView();
    updateCouponView();
  }

  function updateCouponView() {
    const couponEl = document.querySelector('[data-coupon-section]');
    if (couponEl) {
      couponEl.innerHTML = selectedCoupon
        ? `<span class="coupon-name">${selectedCoupon.name || ''}</span><span class="coupon-discount">-¥${getDiscount().toFixed(2)}</span>`
        : `<span class="text-muted">选择优惠券</span><span class="addr-arrow">›</span>`;
    }
  }

  function setRemark(val) {
    remark = val;
  }

  async function submit(useProxyPay) {
    if (submitting) return; // 防重复提交
    if (!address) {
      App.toast('请选择收货地址');
      return;
    }
    if (items.length === 0) {
      App.toast('请选择商品');
      return;
    }
    if (deliveryType === 2 && !deliveryTimeSlot) {
      App.toast('请选择送达时段');
      showTimeSlotPicker();
      return;
    }

    submitting = true;
    const orderData = {
      items: items.map(i => ({
        skuId: i.skuId || i.id,
        quantity: i.quantity,
        specId: i.specId || i.skuSpecId || (i.spec && typeof i.spec === 'object' ? i.spec.id : null) || null,
      })),
      addressId: address.id,
      deliveryTimeType: deliveryType,
      deliveryTimeSlot: deliveryType === 1 ? null : deliveryTimeSlot,
      couponId: selectedCoupon ? selectedCoupon.userCouponId : null,
      remark: remark,
      cartItemIds: App.state.buyNowItem ? [] : items.map(i => i.id).filter(Boolean),
    };

    // 按钮 loading 状态
    const btns = document.querySelectorAll('.oc-submit-bar button');
    btns.forEach(b => { b.disabled = true; b.dataset.origText = b.textContent; b.textContent = '处理中...'; });

    try {
      const order = await API.createOrder(orderData);
      if (!order || !order.orderNo) {
        throw new Error('订单创建返回数据异常');
      }
      App.toast('订单创建成功');
      App.state.buyNowItem = null;
      await App.refreshCart();

      if (useProxyPay) {
        try {
          const proxy = await API.reqProxyPay(order.orderNo);
          App.go('order-detail/' + order.orderNo + '?proxy=' + encodeURIComponent(proxy.token));
        } catch (e2) {
          App.toast('代付链接生成失败，可稍后在订单中发起');
          App.go('order-detail/' + order.orderNo);
        }
        return;
      }

      try {
        await API.payOrder(order.orderNo);
      } catch (payErr) {
        console.error('支付失败:', payErr);
        App.go('order-detail/' + order.orderNo);
        return;
      }

      App.go('pay-success/' + order.orderNo);
    } catch (e) {
      console.error('下单异常:', e);
      App.toast('下单失败: ' + (e.message || '请重试'));
    } finally {
      submitting = false;
      btns.forEach(b => { b.disabled = false; b.textContent = b.dataset.origText || b.textContent; });
    }
  }

  return { render, selectDelivery, selectAddress, setAddress, selectCoupon, setCoupon, setRemark, setTimeSlot, submit };
})();
