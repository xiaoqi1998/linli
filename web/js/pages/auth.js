/* ==========================================================================
   邻里鲜生 · 登录/注册页
   ========================================================================== */
const AuthPage = (function () {
  let mode = 'login'; // 'login' | 'register'
  let loading = false;

  async function render() {
    const html = `
      <div class="auth-page">
        <div class="auth-hero">
          <div class="auth-logo">🥬</div>
          <h1 class="auth-title">邻里鲜生</h1>
          <p class="auth-slogan">社区在线超市 · 30分钟极速达</p>
        </div>

        <div class="auth-card">
          <div class="auth-tabs">
            <button class="auth-tab ${mode === 'login' ? 'active' : ''}" id="tab-login" onclick="AuthPage.switchMode('login')">登录</button>
            <button class="auth-tab ${mode === 'register' ? 'active' : ''}" id="tab-register" onclick="AuthPage.switchMode('register')">注册</button>
          </div>

          <div class="auth-form" id="auth-form">
            <div class="form-field">
              <label class="form-label">手机号</label>
              <div class="form-input-wrap">
                <span class="form-icon">📱</span>
                <input type="tel" id="auth-phone" class="form-input" placeholder="请输入手机号" maxlength="11" value="${mode === 'login' ? '13800138000' : ''}" />
              </div>
            </div>

            <div class="form-field">
              <label class="form-label">密码</label>
              <div class="form-input-wrap">
                <span class="form-icon">🔒</span>
                <input type="password" id="auth-password" class="form-input" placeholder="请输入密码（至少6位）" value="${mode === 'login' ? '123456' : ''}" />
              </div>
            </div>

            <div class="form-field register-only ${mode === 'login' ? 'hidden' : ''}" id="register-fields">
              <label class="form-label">昵称（选填）</label>
              <div class="form-input-wrap">
                <span class="form-icon">😊</span>
                <input type="text" id="auth-nickname" class="form-input" placeholder="给自己起个昵称吧" maxlength="20" />
              </div>
            </div>

            <div class="auth-error hidden" id="auth-error"></div>

            <button class="btn btn-primary btn-block auth-submit-btn" id="auth-submit" onclick="AuthPage.submit()">
              ${mode === 'login' ? '登 录' : '注 册'}
            </button>

            <div class="auth-divider">
              <span class="divider-line"></span>
              <span class="divider-text">或</span>
              <span class="divider-line"></span>
            </div>

            <button class="btn btn-ghost btn-block auth-guest-btn" onclick="AuthPage.guestLogin()">
              <span>🚀</span> 体验模式（免登录）
            </button>
          </div>
        </div>

        <div class="auth-hint">
          ${mode === 'login'
            ? '演示账号：13800138000 / 密码：123456'
            : '注册后即可享受30分钟极速达服务'}
        </div>

        <div class="auth-footer">
          登录即代表同意<a href="javascript:void(0)" onclick="App.toast('用户协议')">《用户协议》</a>和<a href="javascript:void(0)" onclick="App.toast('隐私政策')">《隐私政策》</a>
        </div>
      </div>
    `;
    return html;
  }

  function switchMode(m) {
    mode = m;
    // Update tabs
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-register').classList.toggle('active', mode === 'register');
    // Toggle register fields
    const regFields = document.getElementById('register-fields');
    if (regFields) regFields.classList.toggle('hidden', mode === 'login');
    // Update submit button text
    const btn = document.getElementById('auth-submit');
    if (btn) btn.textContent = mode === 'login' ? '登 录' : '注 册';
    // Clear error
    hideError();
    // Update hint
    const hint = document.querySelector('.auth-hint');
    if (hint) {
      hint.textContent = mode === 'login'
        ? '演示账号：13800138000 / 密码：123456'
        : '注册后即可享受30分钟极速达服务';
    }
    // Focus phone input
    const phoneInput = document.getElementById('auth-phone');
    if (phoneInput && mode === 'register') {
      phoneInput.value = '';
      phoneInput.focus();
    }
    const pwdInput = document.getElementById('auth-password');
    if (pwdInput && mode === 'register') {
      pwdInput.value = '';
    }
  }

  function showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  function hideError() {
    const el = document.getElementById('auth-error');
    if (el) el.classList.add('hidden');
  }

  function setLoading(isLoading) {
    loading = isLoading;
    const btn = document.getElementById('auth-submit');
    if (btn) {
      btn.disabled = isLoading;
      btn.textContent = isLoading ? '请稍候...' : (mode === 'login' ? '登 录' : '注 册');
    }
  }

  async function submit() {
    if (loading) return;
    hideError();

    const phone = document.getElementById('auth-phone').value.trim();
    const password = document.getElementById('auth-password').value;
    const nickname = document.getElementById('auth-nickname')?.value.trim() || '';

    if (!phone) { showError('请输入手机号'); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { showError('手机号格式不正确'); return; }
    if (!password) { showError('请输入密码'); return; }
    if (password.length < 6) { showError('密码至少6位'); return; }

    setLoading(true);
    try {
      let res;
      if (mode === 'login') {
        res = await API.login(phone, password);
      } else {
        res = await API.register(phone, password, nickname);
      }

      if (res && res.token) {
        API.setToken(res.token);
        App.state.user = res;
        App.toast(mode === 'login' ? '登录成功' : '注册成功，欢迎加入邻里鲜生！');
        setTimeout(() => { App.go('home'); }, 600);
      } else {
        showError('登录失败，请重试');
      }
    } catch (err) {
      showError(err.message || '网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function guestLogin() {
    try {
      const res = await API.loginGuest();
      if (res && res.token) {
        API.setToken(res.token);
        App.state.user = res;
        App.toast('已进入体验模式');
        setTimeout(() => { App.go('home'); }, 500);
      }
    } catch (err) {
      App.toast('进入体验模式失败');
    }
  }

  return { render, switchMode, submit, guestLogin };
})();
