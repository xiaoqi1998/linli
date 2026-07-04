/* ==========================================================================
   邻里鲜生 · 代付页 (子女/亲友代付)
   ========================================================================== */
const ProxyPayPage = (function () {
  let orderInfo = null;
  let token = '';

  async function render(t) {
    token = t || '';
    if (!token) {
      return `<div class="page" style="padding:40px 20px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">😅</div>
        <p style="color:var(--color-muted);">代付链接无效</p>
      </div>`;
    }

    // 获取代付订单信息
    try {
      orderInfo = await API.getProxyPay(token);
    } catch (e) {
      orderInfo = null;
    }

    if (!orderInfo) {
      return `<div class="page" style="padding:40px 20px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">😅</div>
        <p style="color:var(--color-muted);">代付链接无效或订单不存在</p>
        <button class="btn btn-primary" style="margin-top:20px;" onclick="location.hash='#/home'">返回首页</button>
      </div>`;
    }

    // 已支付
    if (orderInfo.status >= 20) {
      return `<div class="page" style="padding:40px 20px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">✅</div>
        <h3 style="font-family:var(--font-heading);margin:0 0 8px;">订单已支付</h3>
        <p style="color:var(--color-muted);">这笔订单已完成支付，无需重复操作</p>
        <button class="btn btn-primary" style="margin-top:20px;" onclick="location.hash='#/home'">返回首页</button>
      </div>`;
    }

    const items = orderInfo.items || [];
    let itemsHtml = items.map(i => `
      <div class="proxy-item">
        <div class="proxy-item-emoji">${i.emoji || '📦'}</div>
        <div class="proxy-item-info">
          <div class="proxy-item-name">${i.name}</div>
          <div class="proxy-item-spec">${i.spec || ''} × ${i.quantity}</div>
        </div>
        <div class="proxy-item-price">¥${(i.price * i.quantity).toFixed(2)}</div>
      </div>
    `).join('');

    const requesterName = orderInfo.requesterName || '邻居';

    return `
      <div class="page proxy-pay-page">
        <div class="nav-header">
          <span class="nav-back" onclick="location.hash='#/home'">‹</span>
          <h1>帮TA代付</h1>
        </div>
        <div class="proxy-pay-body">
          <div class="proxy-order-card">
            <div class="proxy-order-header">
              <span class="proxy-order-no">订单号: ${orderInfo.orderNo}</span>
              <span class="proxy-order-user">下单人: ${requesterName}</span>
            </div>
            ${itemsHtml}
            <div class="proxy-total-row">
              <span>代付金额</span>
              <span class="proxy-total-amount">¥${(orderInfo.payAmount || 0).toFixed(2)}</span>
            </div>
          </div>

          <div class="proxy-pay-tips">
            <p>💳 您正在帮 <strong>${requesterName}</strong> 代付订单</p>
            <p>支付完成后，订单将立即进入配送流程</p>
          </div>

          <div style="height:100px;"></div>

          <div class="proxy-submit-bar">
            <div>
              <div style="font-size:12px;color:var(--color-muted);">代付金额</div>
              <div style="font-size:24px;font-weight:900;color:var(--color-accent);">¥${(orderInfo.payAmount || 0).toFixed(2)}</div>
            </div>
            <button class="btn btn-primary btn-lg" onclick="ProxyPayPage.pay()">确认代付</button>
          </div>
        </div>
      </div>
    `;
  }

  async function pay() {
    const btn = document.querySelector('.proxy-submit-bar .btn');
    if (btn) { btn.disabled = true; btn.textContent = '支付中...'; }
    try {
      await API.doProxyPay(token);
      App.toast('代付成功！');
      const main = document.getElementById('page-container');
      if (main) {
        main.innerHTML = `<div class="page" style="padding:60px 20px;text-align:center;">
          <div style="font-size:64px;margin-bottom:20px;">🎉</div>
          <h3 style="font-family:var(--font-heading);font-size:22px;margin:0 0 12px;">代付成功！</h3>
          <p style="color:var(--color-muted);margin-bottom:30px;">您已成功帮 <strong>${orderInfo?.requesterName || '邻居'}</strong> 支付了 ¥${(orderInfo?.payAmount || 0).toFixed(2)}</p>
          <button class="btn btn-primary btn-lg" onclick="location.hash='#/home'">返回首页</button>
        </div>`;
      }
    } catch (e) {
      App.toast(e.message || '代付失败，请重试');
      if (btn) { btn.disabled = false; btn.textContent = '确认代付'; }
    }
  }

  return { render, pay };
})();
