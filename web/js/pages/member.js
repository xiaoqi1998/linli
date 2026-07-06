/* ==========================================================================
   邻里鲜生 · 会员中心页
   ========================================================================== */
const MemberPage = (function () {
  async function render() {
    let user, points;
    try {
      user = await API.getProfile();
    } catch (e) {
      user = API.mock.USER;
    }
    try {
      points = await API.getPoints();
    } catch (e) {
      points = { points: user.points || 0, history: [] };
    }

    const levelName = user.memberLevelName || (user.memberLevel >= 3 ? '老街坊' : user.memberLevel >= 2 ? '老熟人' : '新邻居');
    const nextLevel = user.memberLevel < 3 ? (user.memberLevel >= 2 ? '老街坊' : '老熟人') : null;
    const nextNeed = user.nextLevelConsume || (user.memberLevel === 1 ? 199 - (user.totalConsume || 0) : 999 - (user.totalConsume || 0));

    let html = `
      <div class="page member-page">
        <div class="member-header" onclick="MemberPage.openEditProfile()" style="cursor:pointer">
          <div class="member-avatar">${
            (() => {
              const url = user.avatarUrl || user.avatar || '';
              if (url.includes('placehold.co')) return '😊';
              if (url.startsWith('http')) {
                return `<img src="${url}" alt="头像" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;" onerror="this.parentNode.textContent='😊'" />`;
              }
              return url || '😊';
            })()
          }</div>
          <div class="member-info">
            <h2>${user.nickName}</h2>
            <p>${user.phone || '未绑定手机号'}</p>
          </div>
          <div class="member-level-badge lv${user.memberLevel}">${levelName}</div>
          <span class="member-edit-icon">✏️</span>
        </div>
        <div class="member-stats">
          <div class="stat-item"><span class="stat-num">${user.points || 0}</span><span class="stat-label">积分</span></div>
          <div class="stat-item"><span class="stat-num">${user.couponCount || 0}</span><span class="stat-label">优惠券</span></div>
          <div class="stat-item"><span class="stat-num">${user.orderCount || 0}</span><span class="stat-label">订单</span></div>
        </div>
    `;

    if (nextLevel) {
      html += `
        <div class="member-upgrade">
          <p>再消费 ¥${Math.max(0, nextNeed).toFixed(0)} 即可升级为 ${nextLevel}</p>
          <div class="upgrade-bar"><div class="upgrade-fill" style="width:${Math.min(100, ((user.totalConsume || 0) / (user.memberLevel === 1 ? 199 : 999)) * 100)}%"></div></div>
        </div>
      `;
    }

    html += `
        <div class="member-section">
          <h3>等级权益</h3>
          <div class="benefit-list">
            <div class="benefit-item"><span class="benefit-icon">🎫</span><span>每月${user.memberLevel >= 2 ? '2' : '0'}张免配送费券</span></div>
            <div class="benefit-item"><span class="benefit-icon">🎁</span><span>生日礼券</span></div>
            ${user.memberLevel >= 3 ? '<div class="benefit-item"><span class="benefit-icon">⭐</span><span>专属95折</span></div>' : ''}
            ${user.memberLevel >= 3 ? '<div class="benefit-item"><span class="benefit-icon">🎧</span><span>优先客服</span></div>' : ''}
          </div>
        </div>
    `;

    if (points.history && points.history.length) {
      html += `
        <div class="member-section">
          <h3>积分明细</h3>
          <div class="points-list">
            ${points.history.map(h => `
              <div class="points-item">
                <div class="points-info"><span class="points-desc">${h.desc}</span><span class="points-time">${h.time}</span></div>
                <span class="points-amount ${h.amount > 0 ? 'plus' : 'minus'}">${h.amount > 0 ? '+' : ''}${h.amount}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    html += `
        <div class="member-menu">
          <div class="member-menu-item" onclick="App.go('orders')"><span class="member-menu-icon">📋</span><span class="member-menu-text">我的订单</span><span class="member-menu-arrow">›</span></div>
          <div class="member-menu-item" onclick="App.go('addresses')"><span class="member-menu-icon">📍</span><span class="member-menu-text">收货地址</span><span class="member-menu-arrow">›</span></div>
          <div class="member-menu-item" onclick="App.go('coupons')"><span class="member-menu-icon">🎫</span><span class="member-menu-text">优惠券</span><span class="member-menu-arrow">›</span></div>
          <div class="member-menu-item" onclick="App.toast('客服功能开发中')"><span class="member-menu-icon">🎧</span><span class="member-menu-text">联系客服</span><span class="member-menu-arrow">›</span></div>
          <div class="member-menu-item" onclick="API.setToken('');App.go('auth')"><span class="member-menu-icon">🚪</span><span class="member-menu-text">退出登录</span><span class="member-menu-arrow">›</span></div>
        </div>
      </div>
    `;

    return html;
  }

  /* ---- Addresses Page ---- */
  async function renderAddresses() {
    let addresses = [];
    try {
      addresses = await API.getAddresses();
    } catch (e) {
      addresses = API.mock.ADDRESSES;
    }

    return `
      <div class="page">
        <div class="nav-header">
          <div class="nav-back" onclick="App.back()">‹</div>
          <div class="nav-title">收货地址</div>
        </div>
        <div style="padding:12px 0;">
          ${addresses.length === 0
            ? App.emptyState('📍', '暂无收货地址', '点击下方按钮添加', '新增地址', "App.go('address-edit/0')")
            : addresses.map(a => `
              <div class="address-card" onclick="App.go('address-edit/${a.id}')">
                <div class="address-info">
                  <div class="address-name">${a.name || a.contact_name || ''} <span class="phone">${a.phone || a.contact_phone || ''}</span></div>
                  <div class="address-detail">${a.tag ? `<span class="address-tag">${a.tag}</span>` : ''}${a.detail || a.detail_address || ''}</div>
                </div>
                <div class="address-actions">✏️</div>
              </div>
            `).join('')
          }
        </div>
        <div style="padding:16px;">
          <button class="btn btn-primary btn-block" onclick="App.go('address-edit/0')">+ 新增收货地址</button>
        </div>
      </div>
    `;
  }

  /* ---- Address Edit Page ---- */
  async function renderAddressEdit(id) {
    let address = null;
    if (id && id !== '0') {
      try {
        const addresses = await API.getAddresses();
        address = addresses.find(a => a.id == id);
      } catch (e) {
        address = API.mock.ADDRESSES.find(a => a.id == id);
      }
    }

    const isEdit = !!address;

    return `
      <div class="page">
        <div class="nav-header">
          <div class="nav-back" onclick="App.back()">‹</div>
          <div class="nav-title">${isEdit ? '编辑地址' : '新增地址'}</div>
        </div>
        <div style="padding:16px;">
          <div class="form-group">
            <label class="form-label">收货人</label>
            <input type="text" class="form-input" id="addr-name" placeholder="请输入收货人姓名" value="${address ? (address.name || address.contact_name || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">手机号</label>
            <input type="tel" class="form-input" id="addr-phone" placeholder="请输入手机号" value="${address ? (address.phone || address.contact_phone || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">详细地址</label>
            <textarea class="form-input" id="addr-detail" placeholder="请输入详细地址（楼栋门牌号）" rows="3">${address ? (address.detail || address.detail_address || '') : ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">地图定位</label>
            <input type="hidden" id="addr-latitude" value="${address ? (address.latitude || '') : ''}" />
            <input type="hidden" id="addr-longitude" value="${address ? (address.longitude || '') : ''}" />
            <div id="addr-map-container" style="width:100%;height:200px;border-radius:12px;overflow:hidden;background:#e8eef0;position:relative;">
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:var(--color-muted);">
                <div style="font-size:32px;">🗺️</div>
                <div style="font-size:13px;margin-top:6px;">点击下方按钮选择位置</div>
              </div>
            </div>
            <button type="button" id="addr-pick-map-btn" style="width:100%;margin-top:8px;padding:10px;border:1.5px solid var(--color-primary);border-radius:10px;background:#fff;color:var(--color-primary);font-size:13px;font-weight:600;">
              📍 地图选点
            </button>
          </div>
          <div class="form-group">
            <label class="form-label">标签</label>
            <div class="tag-selector" id="addr-tag-selector">
              ${['家', '公司', '学校', '其他'].map(t => `
                <span class="tag-opt ${address && address.tag === t ? 'active' : ''}" onclick="MemberPage.selectTag('${t}')">${t}</span>
              `).join('')}
            </div>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="addr-default" ${address && address.isDefault ? 'checked' : ''} style="accent-color:var(--color-primary);width:18px;height:18px;" />
            <label for="addr-default" style="margin:0;cursor:pointer;font-size:14px;">设为默认地址</label>
          </div>
          <input type="hidden" id="addr-selected-tag" value="${address ? (address.tag || '') : ''}" />
          <div style="height:24px;"></div>
          ${isEdit ? `<button class="btn btn-ghost btn-block" style="margin-bottom:12px;color:var(--color-danger);" onclick="MemberPage.deleteAddress(${id})">删除地址</button>` : ''}
          <button class="btn btn-primary btn-block" onclick="MemberPage.saveAddress(${id || 0})">保存</button>
        </div>
      </div>
    `;
  }

  function bindMapPicker() {
    const btn = document.getElementById('addr-pick-map-btn');
    if (!btn) return;
    btn.onclick = openMapPicker;
    // 若已有经纬度, 显示在地图上
    const lat = document.getElementById('addr-latitude').value;
    const lng = document.getElementById('addr-longitude').value;
    if (lat && lng) {
      showAddressMap(parseFloat(lat), parseFloat(lng));
    }
  }

  function showAddressMap(lat, lng) {
    const container = document.getElementById('addr-map-container');
    if (!container) return;
    container.innerHTML = '';
    if (typeof MapComponent === 'undefined') return;
    const map = MapComponent.createMap(container, {
      center: [lat, lng],
      zoom: 15,
      scrollWheelZoom: false,
    });
    if (!map) return;
    L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div class="map-marker-circle user">📍</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
    }).addTo(map);
  }

  function openMapPicker() {
    // 弹出全屏地图选点
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;';
    overlay.innerHTML = `
      <div class="nav-header">
        <div class="nav-back" id="map-picker-close">‹</div>
        <div class="nav-title">选择收货位置</div>
        <div style="width:30px;"></div>
      </div>
      <div id="map-picker-area" style="width:100%;height:calc(100% - 50px);"></div>
    `;
    document.body.appendChild(overlay);

    const initial = {
      latitude: parseFloat(document.getElementById('addr-latitude').value) || null,
      longitude: parseFloat(document.getElementById('addr-longitude').value) || null,
      address: document.getElementById('addr-detail').value || '',
    };

    setTimeout(() => {
      const area = document.getElementById('map-picker-area');
      if (!area) return;
      MapComponent.renderPickerMap(area, initial, (lat, lng, addrText) => {
        document.getElementById('addr-latitude').value = lat;
        document.getElementById('addr-longitude').value = lng;
        // 若地址栏为空，用反向地理编码结果填充
        const detailEl = document.getElementById('addr-detail');
        if (!detailEl.value.trim() && addrText) {
          detailEl.value = addrText;
        }
        overlay.remove();
        showAddressMap(lat, lng);
        App.toast('位置已选择');
      });
    }, 100);

    document.getElementById('map-picker-close').onclick = () => overlay.remove();
  }

  let selectedTag = '';
  function selectTag(tag) {
    selectedTag = tag;
    document.querySelectorAll('.tag-opt').forEach(el => {
      el.classList.toggle('active', el.textContent === tag);
    });
    const hidden = document.getElementById('addr-selected-tag');
    if (hidden) hidden.value = tag;
  }

  async function saveAddress(id) {
    const name = document.getElementById('addr-name').value.trim();
    const phone = document.getElementById('addr-phone').value.trim();
    const detail = document.getElementById('addr-detail').value.trim();
    const tag = document.getElementById('addr-selected-tag').value || selectedTag;
    const isDefault = document.getElementById('addr-default').checked;
    const latitude = document.getElementById('addr-latitude').value || null;
    const longitude = document.getElementById('addr-longitude').value || null;

    if (!name) { App.toast('请输入收货人姓名'); return; }
    if (!phone || phone.length < 11) { App.toast('请输入正确的手机号'); return; }
    if (!detail) { App.toast('请输入详细地址'); return; }

    const data = { name, phone, detail, tag, isDefault, latitude, longitude };
    try {
      if (id && id !== '0') {
        await API.updateAddress(id, data);
      } else {
        await API.addAddress(data);
      }
      App.toast('保存成功');
      App.go('addresses');
    } catch (e) {
      App.toast('保存失败，请重试');
    }
  }

  async function deleteAddress(id) {
    App.showModal({
      title: '删除地址',
      body: '确定要删除该收货地址吗？',
      cancelText: '取消',
      confirmText: '删除',
      onConfirm: async () => {
        try {
          await API.deleteAddress(id);
          App.toast('已删除');
          App.go('addresses');
          return true;
        } catch (e) {
          App.toast('删除失败');
          return false;
        }
      },
    });
  }

  /* ---- Coupons Page ---- */
  async function renderCoupons() {
    let coupons = [];
    try {
      coupons = await API.getCoupons();
      coupons = Array.isArray(coupons) ? coupons : (coupons.list || []);
    } catch (e) {
      coupons = API.mock.COUPONS;
    }

    return `
      <div class="page">
        <div class="nav-header">
          <div class="nav-back" onclick="App.back()">‹</div>
          <div class="nav-title">我的优惠券</div>
        </div>
        <div style="padding:12px 0;">
          ${coupons.length === 0
            ? App.emptyState('🎫', '暂无优惠券', '参与活动获取优惠券吧')
            : coupons.map(c => `
              <div class="coupon-card ${c.status === 1 ? 'disabled' : ''}" style="margin:0 16px 10px;">
                <div class="coupon-left">
                  ${c.type === 3 ? '<div class="coupon-amount" style="font-size:14px;">免运费</div>' : `<div class="coupon-amount">${c.faceValue}</div>`}
                  <div class="coupon-label">${c.desc || ''}</div>
                </div>
                <div class="coupon-right">
                  <div class="coupon-name">${c.name}</div>
                  <div class="coupon-desc">${c.status === 1 ? '已使用' : '可用'}</div>
                  <div class="coupon-date">有效期至 ${c.validEnd || ''}</div>
                </div>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }

  /* ---- Points Page ---- */
  async function renderPoints() {
    let pointsData;
    try {
      pointsData = await API.getPoints();
    } catch (e) {
      pointsData = { points: API.mock.USER.points || 0, history: [] };
    }

    const history = pointsData.history || [];

    return `
      <div class="page">
        <div class="nav-header">
          <div class="nav-back" onclick="App.back()">‹</div>
          <div class="nav-title">我的积分</div>
        </div>
        <div class="points-header">
          <div class="points-total">${pointsData.points || 0}</div>
          <div class="points-label">可用积分</div>
        </div>
        <div class="member-section" style="margin-top:12px;">
          <h3>积分明细</h3>
          ${history.length === 0
            ? '<div class="empty-state" style="padding:30px;"><div class="empty-emoji">📊</div><div class="empty-desc">暂无积分记录</div></div>'
            : `<div class="points-list">
              ${history.map(h => `
                <div class="points-item">
                  <div class="points-info">
                    <span class="points-desc">${h.desc}</span>
                    <span class="points-time">${h.time}</span>
                  </div>
                  <span class="points-amount ${h.amount > 0 ? 'plus' : 'minus'}">${h.amount > 0 ? '+' : ''}${h.amount}</span>
                </div>
              `).join('')}
            </div>`
          }
        </div>
      </div>
    `;
  }

  // 预设头像列表
  const PRESET_AVATARS = ['😊', '😎', '🥳', '🤗', '😇', '🦊', '🐱', '🐶', '🐰', '🐼', '🐨', '🦁', '🐸', '🐵', '🦄', '🐲'];

  // 个人信息编辑弹窗
  function openEditProfile() {
    const user = App.state.user || {};
    const currentAvatar = (user.avatarUrl || '').includes('placehold.co') ? '😊' : (user.avatarUrl || user.avatar || '😊');
    const isEmojiAvatar = !currentAvatar.startsWith('http');

    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    overlay.id = 'edit-profile-sheet';
    overlay.innerHTML = `
      <div class="sheet-box" style="max-height:85vh;overflow-y:auto">
        <div class="sheet-handle"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 20px 12px;">
          <h3 style="font-family:var(--font-heading);font-size:17px;margin:0">编辑个人信息</h3>
          <span style="font-size:24px;cursor:pointer;color:var(--color-muted)" onclick="document.getElementById('edit-profile-sheet').remove()">×</span>
        </div>
        <div style="padding:0 20px 24px">
          <div class="edit-profile-section">
            <label>头像</label>
            <div class="avatar-picker">
              <div class="avatar-current" id="avatar-preview">${isEmojiAvatar ? currentAvatar : `<img src="${currentAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.parentNode.textContent='😊'" />`}</div>
              <div class="avatar-grid">
                ${PRESET_AVATARS.map(a => `<div class="avatar-option" onclick="MemberPage.selectAvatar('${a}')">${a}</div>`).join('')}
              </div>
            </div>
          </div>
          <div class="edit-profile-section">
            <label>昵称</label>
            <input type="text" id="edit-nickname" class="edit-input" value="${user.nickName || ''}" maxlength="20" placeholder="请输入昵称" />
          </div>
          <div class="edit-profile-section">
            <label>手机号</label>
            <div class="edit-phone-display">${user.phone || '未绑定（暂不支持修改）'}</div>
          </div>
          <button class="edit-save-btn" onclick="MemberPage.saveProfile()">保存修改</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    // 记录当前选中的头像
    overlay.dataset.avatar = isEmojiAvatar ? currentAvatar : '';
    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  function selectAvatar(emoji) {
    const preview = document.getElementById('avatar-preview');
    if (preview) preview.textContent = emoji;
    const overlay = document.getElementById('edit-profile-sheet');
    if (overlay) overlay.dataset.avatar = emoji;
  }

  async function saveProfile() {
    const nickName = document.getElementById('edit-nickname')?.value?.trim();
    const overlay = document.getElementById('edit-profile-sheet');
    const avatarUrl = overlay?.dataset?.avatar || '';

    if (!nickName) { App.toast('昵称不能为空'); return; }
    if (nickName.length > 20) { App.toast('昵称最多20个字符'); return; }

    const btn = document.querySelector('.edit-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

    try {
      const data = {};
      if (nickName !== (App.state.user?.nickName || '')) data.nickName = nickName;
      if (avatarUrl && avatarUrl !== (App.state.user?.avatarUrl || '')) data.avatarUrl = avatarUrl;
      if (Object.keys(data).length === 0) {
        App.toast('没有修改');
        overlay?.remove();
        return;
      }
      const updated = await API.updateProfile(data);
      // 更新全局状态
      App.state.user = { ...App.state.user, ...updated };
      App.toast('修改成功');
      overlay?.remove();
      // 刷新页面
      App.render();
    } catch (e) {
      App.toast(e.message || '修改失败');
      if (btn) { btn.disabled = false; btn.textContent = '保存修改'; }
    }
  }

  return { render, renderAddresses, renderAddressEdit, renderCoupons, renderPoints, selectTag, saveAddress, deleteAddress, bindMapPicker, openEditProfile, selectAvatar, saveProfile };
})();
