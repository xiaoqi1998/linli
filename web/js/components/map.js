/**
 * 地图组件 (基于 Leaflet + OpenStreetMap, 免费无需 API Key)
 * 提供三组能力:
 *   1. renderLocationMap   - 社区定位展示
 *   2. renderPickerMap     - 地址地图选点
 *   3. renderRiderTrackMap - 骑手实时位置追踪 (演示: 模拟移动)
 */
window.MapComponent = (function () {
  // 默认中心: 深圳南山 (seed 数据位置)
  const DEFAULT_CENTER = [22.5431, 113.9465];
  const DEFAULT_ZOOM = 14;

  /**
   * 通用: 创建 Leaflet 地图实例
   */
  function createMap(container, opts = {}) {
    if (typeof L === 'undefined') {
      console.error('[MapComponent] Leaflet 未加载');
      return null;
    }
    const map = L.map(container, {
      zoomControl: opts.zoomControl !== false,
      attributionControl: false,
      dragging: opts.dragging !== false,
      scrollWheelZoom: opts.scrollWheelZoom === true,
      doubleClickZoom: opts.doubleClickZoom !== false,
    }).setView(opts.center || DEFAULT_CENTER, opts.zoom || DEFAULT_ZOOM);

    // 高德地图瓦片 (国内可访问, 免费无需 key)
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 19,
      attribution: '© AutoNavi',
    }).addTo(map);

    return map;
  }

  /**
   * 创建圆形 emoji 标记
   */
  function circleMarker(lat, lng, emoji, type = '') {
    const icon = L.divIcon({
      className: '',
      html: `<div class="map-marker-circle ${type}">${emoji}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    return L.marker([lat, lng], { icon });
  }

  /**
   * 1. 社区定位展示地图
   * @param {HTMLElement} container
   * @param {Object} community - { name, address, latitude, longitude, eta }
   * @param {Object} userLocation - { latitude, longitude } (可选)
   */
  function renderLocationMap(container, community, userLocation) {
    if (!container) return null;
    container.classList.add('map-container');

    const center = community && community.latitude
      ? [community.latitude, community.longitude]
      : (userLocation && userLocation.latitude ? [userLocation.latitude, userLocation.longitude] : DEFAULT_CENTER);

    const map = createMap(container, { center, zoom: 13, scrollWheelZoom: false });

    if (!map) return null;

    // 社区标记
    if (community && community.latitude) {
      const m = circleMarker(community.latitude, community.longitude, '🏠', 'community');
      m.addTo(map).bindPopup(`<strong>${community.name || '社区'}</strong><br>${community.address || ''}`);
    }

    // 用户位置标记
    if (userLocation && userLocation.latitude) {
      circleMarker(userLocation.latitude, userLocation.longitude, '📍', 'user').addTo(map);
    }

    // 配送范围圈 (1.5km)
    if (community && community.latitude) {
      L.circle([community.latitude, community.longitude], {
        radius: 1500,
        color: '#2e7d32',
        weight: 1,
        fillColor: '#2e7d32',
        fillOpacity: 0.08,
      }).addTo(map);
    }

    return map;
  }

  /**
   * 2. 地址地图选点
   * @param {HTMLElement} container
   * @param {Object} initial - { latitude, longitude, address }
   * @param {Function} onPick - (lat, lng) => 回调
   */
  function renderPickerMap(container, initial, onPick) {
    if (!container) return null;
    container.classList.add('map-container', 'tall');

    const center = initial && initial.latitude
      ? [initial.latitude, initial.longitude]
      : DEFAULT_CENTER;

    const map = createMap(container, { center, zoom: 16, scrollWheelZoom: true });
    if (!map) return null;

    // 中心十字准星
    const crosshair = document.createElement('div');
    crosshair.className = 'map-picker-crosshair';
    crosshair.textContent = '📍';
    container.appendChild(crosshair);

    // 初始标记
    let marker = L.marker(center, {
      icon: L.divIcon({
        className: '',
        html: '<div class="map-marker-circle user">📍</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
      draggable: true,
    }).addTo(map);

    // 底部地址确认条
    const bar = document.createElement('div');
    bar.className = 'map-picker-bar';
    bar.innerHTML = `
      <div class="picker-addr">${initial && initial.address ? initial.address : '移动地图或拖动标记选择位置'}</div>
      <button class="picker-confirm">确认位置</button>
    `;
    container.appendChild(bar);

    let currentLat = center[0];
    let currentLng = center[1];

    function updateAddr(lat, lng) {
      currentLat = lat;
      currentLng = lng;
      // 演示: 反向地理编码用 Nominatim 免费服务 (节流避免高频请求)
      clearTimeout(bar._tm);
      bar._tm = setTimeout(async () => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=zh-CN`);
          const data = await res.json();
          if (data && data.display_name) {
            bar.querySelector('.picker-addr').textContent = data.display_name;
          }
        } catch (e) {
          // 忽略
        }
      }, 600);
    }

    // 地图移动时, 更新标记位置和地址
    map.on('move', () => {
      const c = map.getCenter();
      marker.setLatLng(c);
      updateAddr(c.lat, c.lng);
    });

    // 拖动标记
    marker.on('dragend', () => {
      const ll = marker.getLatLng();
      map.panTo(ll);
      updateAddr(ll.lat, ll.lng);
    });

    // 确认按钮
    bar.querySelector('.picker-confirm').addEventListener('click', () => {
      if (onPick) onPick(currentLat, currentLng, bar.querySelector('.picker-addr').textContent);
    });

    updateAddr(center[0], center[1]);

    return map;
  }

  /**
   * 3. 骑手实时位置追踪地图 (演示模式: 模拟骑手从起点移动到用户地址)
   * @param {HTMLElement} container
   * @param {Object} opts - { rider: {name, phone, lat, lng}, dest: {lat, lng}, durationSec }
   * @returns {Object} { map, stop }
   */
  function renderRiderTrackMap(container, opts) {
    if (!container) return null;
    container.classList.add('map-container', 'tall');

    const rider = opts.rider || {};
    const dest = opts.dest || {};

    // 默认位置: 骑手在前置仓, 目的地在用户地址
    const riderStart = rider.latitude ? [rider.latitude, rider.longitude] : [22.5400, 113.9450];
    const destPos = dest.latitude ? [dest.latitude, dest.longitude] : DEFAULT_CENTER;

    const map = createMap(container, {
      center: [(riderStart[0] + destPos[0]) / 2, (riderStart[1] + destPos[1]) / 2],
      zoom: 14,
      scrollWheelZoom: false,
    });

    if (!map) return null;

    // 配送路径线
    const routeLine = L.polyline([riderStart, destPos], {
      color: '#ff7043',
      weight: 3,
      opacity: 0.6,
      dashArray: '6, 8',
    }).addTo(map);

    // 骑手标记 (带脉冲圈)
    const riderIcon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;">
          <div class="rider-pulse"></div>
          <div class="map-marker-circle rider">🛵</div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    const riderMarker = L.marker(riderStart, { icon: riderIcon }).addTo(map);
    riderMarker.bindPopup(`<strong>${rider.name || '骑手'}</strong><br>${rider.phone || ''}`);

    // 用户地址标记
    circleMarker(destPos[0], destPos[1], '🏠', 'community').addTo(map)
      .bindPopup('<strong>收货地址</strong>');

    // 浮动信息条
    const infoBar = document.createElement('div');
    infoBar.className = 'map-floating-info';
    infoBar.innerHTML = `
      <span class="map-info-emoji">🛵</span>
      <div class="map-info-text">
        <div style="font-weight:600;">${rider.name || '骑手'} 正在配送</div>
        <div class="map-info-eta" id="map-eta-text">预计 3 分钟送达</div>
      </div>
    `;
    container.appendChild(infoBar);

    // 演示: 模拟骑手沿路径从起点移动到终点
    const durationMs = (opts.durationSec || 9) * 1000; // 默认 9 秒走完
    const steps = 60;
    const intervalMs = durationMs / steps;
    let step = 0;
    let stopped = false;

    const timer = setInterval(() => {
      if (stopped) return;
      step++;
      const t = Math.min(step / steps, 1);
      // 线性插值
      const lat = riderStart[0] + (destPos[0] - riderStart[0]) * t;
      const lng = riderStart[1] + (destPos[1] - riderStart[1]) * t;
      riderMarker.setLatLng([lat, lng]);

      // 更新 ETA
      const remainMin = Math.max(1, Math.ceil((1 - t) * (opts.durationSec || 9) / 60 * 60));
      const etaEl = infoBar.querySelector('#map-eta-text');
      if (etaEl) {
        if (t >= 1) {
          etaEl.textContent = '骑手已抵达，请准备取货';
          etaEl.style.color = '#2e7d32';
        } else {
          etaEl.textContent = `预计 ${remainMin} 分钟送达`;
        }
      }

      if (t >= 1) {
        clearInterval(timer);
      }
    }, intervalMs);

    // 自动调整视野包含两点
    map.fitBounds(L.latLngBounds([riderStart, destPos]).pad(0.3));

    return {
      map,
      stop: () => { stopped = true; clearInterval(timer); },
    };
  }

  return {
    renderLocationMap,
    renderPickerMap,
    renderRiderTrackMap,
    createMap,
    DEFAULT_CENTER,
  };
})();
