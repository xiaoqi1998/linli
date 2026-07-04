/* ==========================================================================
   邻里鲜生 · 拼团页
   ========================================================================== */
const GroupBuyPage = (function () {
  async function render() {
    let groupBuys = [];
    try {
      const res = await API.getGroupBuys();
      groupBuys = Array.isArray(res) ? res : (res.list || []);
    } catch (e) {
      groupBuys = API.mock.GROUP_BUYS;
    }

    if (!groupBuys.length) {
      return `<div class="page"><div class="nav-header"><div class="nav-back" onclick="App.back()">‹</div><div class="nav-title">邻里拼团</div></div><div class="empty-state"><span class="empty-emoji">🛒</span><p>暂无进行中的拼团活动</p></div></div>`;
    }

    let html = '<div class="page group-buy-page"><div class="nav-header"><div class="nav-back" onclick="App.back()">‹</div><div class="nav-title">邻里拼团</div></div><div class="gb-banner"><span class="gb-banner-emoji">🛒</span><div><h3>邻里拼团</h3><p>和邻居一起买，更便宜</p></div></div><div class="gb-list">';
    groupBuys.forEach(gb => {
      const percent = Math.round((gb.joinedCount / gb.targetCount) * 100);
      const remain = gb.targetCount - gb.joinedCount;
      html += `
        <div class="gb-card" onclick="App.go('group-buy/${gb.id}')">
          <div class="gb-card-img ${gb.bg || 'bg-fruit'}">${gb.emoji || '🛒'}</div>
          <div class="gb-card-info">
            <div class="gb-card-name">${gb.name}</div>
            <div class="gb-card-prices">
              <span class="gb-card-price">${gb.groupPrice}</span>
              <span class="gb-card-old">${gb.marketPrice || gb.originalPrice}</span>
            </div>
            <div class="gb-card-progress">
              <div class="gb-progress-bar">
                <div class="gb-progress-fill" style="width:${percent}%"></div>
              </div>
              <div class="gb-progress-text">
                <span>已拼${gb.joinedCount}/${gb.targetCount}人</span>
                <span>还差${remain}人成团</span>
              </div>
            </div>
            <div class="gb-card-bottom">
              <button class="gb-join-btn" onclick="event.stopPropagation();App.go('group-buy/${gb.id}')">去参团</button>
            </div>
          </div>
        </div>
      `;
    });
    html += '</div></div>';
    return html;
  }

  async function renderDetail(id) {
    let gb;
    try {
      gb = await API.getGroupBuy(id);
    } catch (e) {
      gb = API.mock.GROUP_BUYS.find(g => g.id == id) || API.mock.GROUP_BUYS[0];
    }

    const percent = Math.round((gb.joinedCount / gb.targetCount) * 100);
    const remain = gb.targetCount - gb.joinedCount;

    let html = `
      <div class="page group-buy-detail-page">
        <div class="nav-header">
          <div class="nav-back" onclick="App.back()">‹</div>
          <div class="nav-title">拼团详情</div>
        </div>
        <div class="gb-detail-header ${gb.bg || 'bg-fruit'}">
          <span class="gb-detail-emoji">${gb.emoji || '🛒'}</span>
          <div class="gb-detail-info">
            <h2>${gb.name}</h2>
            <div class="gb-detail-prices">
              <span class="gb-price-big">¥${gb.groupPrice}</span>
              <span class="gb-original">¥${gb.marketPrice || gb.originalPrice}</span>
              <span class="gb-discount-tag">拼团价</span>
            </div>
          </div>
        </div>
        <div class="gb-detail-body">
          <div class="gb-detail-progress">
            <div class="gb-progress-bar lg">
              <div class="gb-progress-fill" style="width:${percent}%"></div>
            </div>
            <div class="gb-progress-info">
              <span>已拼 ${gb.joinedCount}/${gb.targetCount} 人</span>
              <span class="gb-remain">还差 ${remain} 人成团</span>
            </div>
          </div>
          <div class="gb-detail-rules">
            <h4>拼团规则</h4>
            <p>1. ${gb.targetCount}人成团，人满即成团发货</p>
            <p>2. 超时未成团将自动全额退款</p>
            <p>3. 每人限购1件</p>
          </div>
          <div class="gb-detail-participants">
            <h4>已参团邻居</h4>
            <div class="gb-avatars">
              ${Array.from({length: gb.joinedCount}, (_, i) => `<span class="gb-avatar">${['👩','👨','👵','🧑','👱‍♀️'][i % 5]}</span>`).join('')}
            </div>
          </div>
        </div>
        <div class="gb-detail-footer">
          <button class="btn btn-primary btn-block" onclick="GroupBuyPage.join(${gb.id})">立即参团 ¥${gb.groupPrice}</button>
        </div>
      </div>
    `;
    return html;
  }

  function join(id) {
    // Demo mode: directly show success and navigate to orders
    App.toast('参团成功！(演示模式)');
    setTimeout(() => App.go('orders'), 1200);
  }

  return { render, renderDetail, join };
})();
