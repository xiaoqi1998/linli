/* ==========================================================================
   邻里鲜生 · 订单详情页
   ========================================================================== */
const OrderDetailPage = (function () {
  async function render(orderNo) {
    let order;
    try {
      order = await API.getOrder(orderNo);
    } catch (e) {
      order = API.mock.ORDERS.find(o => o.orderNo === orderNo) || API.mock.ORDERS[0];
    }

    if (!order) {
      return `<div class="page"><div class="empty-state"><p>订单不存在</p></div></div>`;
    }

    const statusFlow = [
      { status: 10, label: '待付款' },
      { status: 20, label: '待配送' },
      { status: 30, label: '配送中' },
      { status: 40, label: '待确认' },
      { status: 50, label: '已完成' },
    ];

    let timelineHtml = '<div class="order-timeline">';
    statusFlow.forEach(s => {
      const done = order.status >= s.status;
      const current = order.status === s.status;
      timelineHtml += `
        <div class="timeline-item ${done ? 'done' : ''} ${current ? 'current' : ''}">
          <div class="timeline-dot"></div>
          <span class="timeline-label">${s.label}</span>
        </div>
      `;
    });
    timelineHtml += '</div>';

    let itemsHtml = '<div class="order-items">';
    (order.items || []).forEach(item => {
      itemsHtml += `
        <div class="order-item-row">
          <span class="product-emoji ${item.bg || 'bg-veg'}">${item.emoji || '📦'}</span>
          <div class="order-item-info">
            <span class="order-item-name">${item.name}</span>
            <span class="order-item-spec">${item.spec || ''} x${item.quantity}</span>
          </div>
          <span class="order-item-price">¥${(item.price * item.quantity).toFixed(2)}</span>
        </div>
      `;
    });
    itemsHtml += '</div>';

    let actionsHtml = '<div class="order-detail-actions">';
    if (order.status === 10) {
      actionsHtml += `<button class="btn btn-outline" onclick="OrderDetailPage.cancel('${order.orderNo}')">取消订单</button>`;
      actionsHtml += `<button class="btn btn-outline" onclick="OrderDetailPage.reqProxy('${order.orderNo}')">找人代付</button>`;
      actionsHtml += `<button class="btn btn-primary" onclick="OrderDetailPage.pay('${order.orderNo}')">立即付款</button>`;
    } else if (order.status === 40 || order.status === 30) {
      actionsHtml += `<button class="btn btn-outline" onclick="OrderDetailPage.showAfterSale('${order.orderNo}')">申请售后</button>`;
      actionsHtml += `<button class="btn btn-primary" onclick="OrderDetailPage.confirm('${order.orderNo}')">确认收货</button>`;
    } else if (order.status === 50) {
      actionsHtml += `<button class="btn btn-outline" onclick="OrderDetailPage.showAfterSale('${order.orderNo}')">申请售后</button>`;
      actionsHtml += `<button class="btn btn-outline" onclick="OrderDetailPage.rebuy('${order.orderNo}')">再来一单</button>`;
    } else if (order.status === 99) {
      actionsHtml += `<button class="btn btn-outline" onclick="OrderDetailPage.rebuy('${order.orderNo}')">重新购买</button>`;
    }
    actionsHtml += '</div>';

    return `
      <div class="page order-detail-page">
        <div class="nav-header">
          <div class="nav-back" onclick="App.back()">‹</div>
          <div class="nav-title">订单详情</div>
        </div>
        <div class="order-status-banner">
          <h2>${order.statusText || '订单详情'}</h2>
          ${order.status === 10 ? `<p class="countdown">请在 ${order.expireAt ? Math.max(1, Math.ceil((new Date(order.expireAt).getTime() - Date.now())/60000)) : 15} 分钟内完成付款</p>` : ''}
          ${order.status === 30 ? `<p class="countdown">骑手正在配送，请耐心等待</p>` : ''}
        </div>
        ${(order.status === 30 || order.status === 40) ? `
          <div class="order-section">
            <h3>骑手位置 ${order.status === 40 ? '<span style="font-size:12px;color:var(--color-muted);font-weight:400;">已送达</span>' : ''}</h3>
            <div id="rider-map" style="width:100%;height:280px;border-radius:12px;overflow:hidden;background:#e8eef0;position:relative;">
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--color-muted);font-size:13px;">地图加载中...</div>
            </div>
            <div id="rider-info" style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:13px;color:var(--color-muted);"></div>
          </div>
        ` : ''}
        ${timelineHtml}
        <div class="order-section">
          <h3>商品信息</h3>
          ${itemsHtml}
          <div class="order-amount-row"><span>商品小计</span><span>¥${(order.skuTotal || 0).toFixed(2)}</span></div>
          <div class="order-amount-row"><span>配送费</span><span>¥${(order.deliveryFee || 0).toFixed(2)}</span></div>
          ${(order.couponDiscount || order.discount || 0) > 0 ? `<div class="order-amount-row discount"><span>优惠</span><span>-¥${(order.couponDiscount || order.discount || 0).toFixed(2)}</span></div>` : ''}
          <div class="order-amount-row total"><span>实付</span><span class="pay-amount">¥${(order.payAmount || 0).toFixed(2)}</span></div>
        </div>
        <div class="order-section">
          <h3>收货信息</h3>
          <div class="order-address-info">
            <p class="addr-name">${order.address?.name || order.address?.contact_name || ''} ${order.address?.phone || order.address?.contact_phone || ''}</p>
            <p class="addr-detail">${order.address?.detail || order.address?.detail_address || ''}</p>
          </div>
        </div>
        <div class="order-section">
          <h3>订单信息</h3>
          <div class="order-info-row"><span>订单编号</span><span>${order.orderNo}</span></div>
          <div class="order-info-row"><span>下单时间</span><span>${order.createdAt || ''}</span></div>
          ${order.payTime ? `<div class="order-info-row"><span>支付时间</span><span>${order.payTime}</span></div>` : ''}
        </div>
        ${actionsHtml}
      </div>
    `;
  }

  async function cancel(orderNo) {
    try {
      await API.cancelOrder(orderNo);
      App.toast('订单已取消');
      App.navigate('orders');
    } catch (e) {
      App.toast('操作失败');
    }
  }

  async function pay(orderNo) {
    try {
      await API.payOrder(orderNo);
      App.toast('支付成功！');
      App.navigate('orders');
    } catch (e) {
      App.toast('支付失败，请重试');
    }
  }

  async function reqProxy(orderNo) {
    try {
      const proxy = await API.reqProxyPay(orderNo);
      const fullUrl = window.location.origin + window.location.pathname + proxy.url;
      // 显示代付链接弹窗
      const overlay = document.createElement('div');
      overlay.className = 'sheet-overlay';
      overlay.id = 'proxy-pay-sheet';
      overlay.innerHTML = `
        <div class="sheet-box" style="max-height:70vh;overflow-y:auto">
          <div class="sheet-handle"></div>
          <div style="padding:20px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">💳</div>
            <h3 style="font-family:var(--font-heading);font-size:18px;margin:0 0 8px;">代付链接已生成</h3>
            <p style="color:var(--color-muted);font-size:13px;margin:0 0 20px;">请将下方链接发送给子女/亲友，他们打开即可帮你付款</p>
            <div style="background:var(--color-bg);border-radius:12px;padding:14px;margin-bottom:20px;word-break:break-all;font-size:13px;color:var(--color-primary);">${fullUrl}</div>
            <button class="btn btn-primary btn-lg" style="width:100%;margin-bottom:8px;" onclick="navigator.clipboard.writeText('${fullUrl}').then(()=>App.toast('链接已复制')).catch(()=>App.toast('请手动复制'))">复制链接</button>
            <button class="btn btn-outline" style="width:100%;" onclick="document.getElementById('proxy-pay-sheet').remove()">关闭</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    } catch (e) {
      App.toast('生成代付链接失败');
    }
  }

  async function confirm(orderNo) {
    try {
      await API.confirmOrder(orderNo);
      App.toast('确认收货成功！');
      App.navigate('orders');
    } catch (e) {
      App.toast('操作失败');
    }
  }

  async function rebuy(orderNo) {
    let order;
    try {
      order = await API.getOrder(orderNo);
    } catch (e) {
      order = API.mock.ORDERS.find(o => o.orderNo === orderNo);
    }
    if (!order || !order.items || order.items.length === 0) {
      App.toast('无法获取订单商品信息');
      return;
    }
    App.showModal({
      title: '再来一单',
      body: `将把订单中的 ${order.items.length} 件商品加入购物车，确认继续？`,
      cancelText: '取消',
      confirmText: '加入购物车',
      onConfirm: async () => {
        try {
          for (const item of order.items) {
            const skuId = item.skuId || item.sku_id || item.id;
            const specId = item.skuSpecId || item.sku_spec_id || null;
            await API.addToCart(skuId, item.quantity, specId);
          }
          await App.refreshCart();
          App.toast('已加入购物车');
          App.go('cart');
          return true;
        } catch (e) {
          App.toast('加购失败，请重试');
          return false;
        }
      },
    });
  }

  function showAfterSale(orderNo) {
    const reasons = [
      { value: 'out_of_stock', label: '商品缺货' },
      { value: 'quality', label: '质量问题' },
      { value: 'wrong_item', label: '送错商品' },
      { value: 'other', label: '其他原因' },
    ];
    App.showModal({
      title: '申请售后',
      body: `
        <div style="text-align:left;">
          <div class="text-muted fs-12 mb-8">请选择售后原因</div>
          <div id="aftersale-reasons" style="display:flex;flex-direction:column;gap:10px;">
            ${reasons.map((r, i) => `
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px;border-radius:8px;border:1.5px solid var(--color-line);">
                <input type="radio" name="aftersale-reason" value="${r.value}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--color-primary);" />
                <span style="font-size:14px;">${r.label}</span>
              </label>
            `).join('')}
          </div>
          <div class="text-muted fs-12 mb-8" style="margin-top:14px;">问题描述（选填）</div>
          <textarea id="aftersale-desc" placeholder="请描述具体问题..." style="width:100%;height:80px;border:1.5px solid var(--color-line);border-radius:8px;padding:8px 10px;font-size:14px;resize:none;font-family:inherit;background:var(--color-bg);"></textarea>
        </div>
      `,
      cancelText: '取消',
      confirmText: '提交申请',
      onConfirm: async () => {
        const reason = document.querySelector('input[name="aftersale-reason"]:checked')?.value || 'other';
        const desc = document.getElementById('aftersale-desc')?.value.trim() || '';
        try {
          await API.refundOrder(orderNo, { reason, description: desc });
          App.toast('售后申请已提交，团长将在24小时内处理');
          // 刷新订单详情
          render(orderNo);
          return true;
        } catch (e) {
          App.toast(e.message || '售后申请失败，请重试');
          return false;
        }
      },
    });
  }

  let _currentOrderNo = null;
  let _riderMapInst = null;
  let _riderPollTimer = null;

  function mountRiderMap(orderNo) {
    _currentOrderNo = orderNo;
    // 若无地图容器, 跳过
    const container = document.getElementById('rider-map');
    if (!container) return;
    loadRiderLocation(orderNo);
  }

  async function loadRiderLocation(orderNo) {
    const container = document.getElementById('rider-map');
    if (!container) return;
    try {
      const data = await API.getRiderLocation(orderNo);
      if (!data || !data.rider) {
        container.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--color-muted);font-size:13px;">暂无骑手位置信息</div>';
        return;
      }
      renderRiderMap(container, data);

      // 配送中: 每 2 秒轮询更新骑手位置
      if (data.orderStatus === 30) {
        if (_riderPollTimer) clearInterval(_riderPollTimer);
        _riderPollTimer = setInterval(async () => {
          try {
            const newData = await API.getRiderLocation(orderNo);
            if (!newData || !newData.rider) return;
            if (newData.orderStatus !== 30) {
              clearInterval(_riderPollTimer);
              _riderPollTimer = null;
              renderRiderMap(container, newData);
              return;
            }
            // 仅更新骑手标记位置
            if (_riderMapInst && _riderMapInst.riderMarker) {
              _riderMapInst.riderMarker.setLatLng([newData.rider.latitude, newData.rider.longitude]);
            }
            const infoEl = document.getElementById('rider-info');
            if (infoEl) {
              const dist = newData.rider.locationUpdatedAt ? '' : '';
              infoEl.innerHTML = `🛵 <strong>${newData.rider.name}</strong> · ${newData.rider.phone} · 位置更新于 ${newData.rider.locationUpdatedAt || '刚刚'}`;
            }
          } catch (e) {
            // 忽略轮询错误
          }
        }, 2000);
      }
    } catch (e) {
      container.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--color-muted);font-size:13px;">骑手位置加载失败</div>';
    }
  }

  function renderRiderMap(container, data) {
    if (typeof MapComponent === 'undefined') {
      container.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--color-muted);">地图组件未加载</div>';
      return;
    }
    container.innerHTML = '';

    const rider = {
      name: data.rider.name,
      phone: data.rider.phone,
      latitude: data.rider.latitude,
      longitude: data.rider.longitude,
    };
    const dest = {
      latitude: data.dest && data.dest.latitude,
      longitude: data.dest && data.dest.longitude,
    };

    // 直接渲染静态地图 (不启动模拟动画, 因为后端已经在模拟更新位置)
    const map = MapComponent.createMap(container, {
      center: [(rider.latitude + dest.latitude) / 2, (rider.longitude + dest.longitude) / 2],
      zoom: 14,
      scrollWheelZoom: false,
    });
    if (!map) return;

    // 配送路径
    L.polyline([[rider.latitude, rider.longitude], [dest.latitude, dest.longitude]], {
      color: '#ff7043', weight: 3, opacity: 0.6, dashArray: '6, 8',
    }).addTo(map);

    // 骑手标记
    const riderIcon = L.divIcon({
      className: '',
      html: `<div style="position:relative;"><div class="rider-pulse"></div><div class="map-marker-circle rider">🛵</div></div>`,
      iconSize: [32, 32], iconAnchor: [16, 16],
    });
    const riderMarker = L.marker([rider.latitude, rider.longitude], { icon: riderIcon }).addTo(map);
    riderMarker.bindPopup(`<strong>${rider.name}</strong><br>${rider.phone}`);

    // 收货地址标记
    L.marker([dest.latitude, dest.longitude], {
      icon: L.divIcon({
        className: '',
        html: '<div class="map-marker-circle community">🏠</div>',
        iconSize: [32, 32], iconAnchor: [16, 16],
      }),
    }).addTo(map).bindPopup('<strong>收货地址</strong>');

    map.fitBounds(L.latLngBounds([[rider.latitude, rider.longitude], [dest.latitude, dest.longitude]]).pad(0.3));

    _riderMapInst = { map, riderMarker };

    // 信息条
    const infoEl = document.getElementById('rider-info');
    if (infoEl) {
      infoEl.innerHTML = `🛵 <strong>${rider.name}</strong> · ${rider.phone} · ${data.orderStatus === 40 ? '已送达' : '配送中'}`;
    }
  }

  return { render, cancel, pay, reqProxy, confirm, rebuy, showAfterSale, mountRiderMap };
})();
