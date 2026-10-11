/** 登录 / 注册界面（未登录时显示，覆盖整个应用） */
import { $, el, esc, toast, api } from './ui.js';

export function renderAuth(status, onSuccess) {
  const existing = $('#authScreen');
  if (existing) existing.remove();

  let mode = status.user_count === 0 ? 'register' : 'login';
  const inviteRequired = !!status.invite_required;
  const registrationOpen = !!status.registration_open;

  const screen = el(`<div id="authScreen" class="auth-screen">
    <div class="auth-card">
      <aside class="auth-side">
        <div class="brand" style="padding:0">
          <span class="brand-logo">🐾</span>
          <div><strong>铲屎官日记</strong><small>宠物管理系统</small></div>
        </div>
        <h2>记录毛孩子的<br />每一天 🐱🐶</h2>
        <ul class="auth-feats">
          <li><span>📔</span>日常日记 · 喂养、便便、心情、照片</li>
          <li><span>💉</span>健康管理 · 体重曲线、疫苗驱虫、就诊</li>
          <li><span>🍚</span>喂食计划 · 定时定量、一键打卡</li>
          <li><span>🍲</span>猫饭狗饭 · 自制食谱与营养计算</li>
          <li><span>⏰</span>提醒待办 · 再也不会忘记驱虫</li>
        </ul>
        <p class="muted small" style="margin-top:auto">
          账号之间数据完全独立，只有你能看到自己的毛孩子。
        </p>
      </aside>

      <section class="auth-main">
        <div class="tabs" style="margin-bottom:18px">
          <button class="tab ${mode === 'login' ? 'active' : ''}" data-mode="login">登录</button>
          ${registrationOpen ? `<button class="tab ${mode === 'register' ? 'active' : ''}" data-mode="register">注册新账号</button>` : ''}
        </div>
        <div id="authFormBox"></div>
      </section>
    </div>
  </div>`);

  document.body.appendChild(screen);

  const formBox = $('#authFormBox', screen);

  const drawForm = () => {
    if (mode === 'login') {
      formBox.innerHTML = `
        <form class="stack">
          <div class="field"><label>用户名</label>
            <input class="input" name="username" autocomplete="username" placeholder="请输入用户名" required /></div>
          <div class="field"><label>密码</label>
            <input class="input" name="password" type="password" autocomplete="current-password" placeholder="请输入密码" required /></div>
          <button class="btn primary block" type="submit" style="margin-top:6px">登录</button>
          ${registrationOpen ? `<p class="muted small" style="text-align:center;margin:2px 0 0">还没有账号？点上面的「注册新账号」</p>` : `<p class="muted small" style="text-align:center;margin:2px 0 0">本站已关闭注册，请联系管理员开通</p>`}
        </form>`;
    } else {
      formBox.innerHTML = `
        <form class="stack">
          <div class="field"><label>用户名</label>
            <input class="input" name="username" autocomplete="username" placeholder="2–20 位，中英文/数字/下划线" required /></div>
          <div class="field"><label>昵称（显示用，可留空）</label>
            <input class="input" name="nickname" placeholder="例如：小明的铲屎官" /></div>
          <div class="field"><label>密码</label>
            <input class="input" name="password" type="password" autocomplete="new-password" placeholder="至少 8 位" required /></div>
          <div class="field"><label>确认密码</label>
            <input class="input" name="password2" type="password" autocomplete="new-password" placeholder="再输入一次" required /></div>
          ${inviteRequired ? `<div class="field"><label>邀请码</label><input class="input" name="invite_code" placeholder="请输入管理员提供的邀请码" required /></div>` : ''}
          <button class="btn primary block" type="submit" style="margin-top:6px">创建账号并开始使用</button>
          <p class="muted small" style="text-align:center;margin:2px 0 0">你的数据只属于这个账号，其他用户看不到</p>
        </form>`;
    }

    const form = $('form', formBox);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      const data = Object.fromEntries(new FormData(form).entries());
      try {
        if (mode === 'register') {
          if (data.password !== data.password2) throw new Error('两次输入的密码不一致');
          const res = await api.post('/api/auth/register', {
            username: data.username,
            password: data.password,
            nickname: data.nickname,
            invite_code: data.invite_code,
          });
          toast(res.is_first_user ? '欢迎！你是本站的第一个账号，已获得管理员权限' : '注册成功，欢迎使用！', 'ok');
        } else {
          const res = await api.post('/api/auth/login', data);
          toast(`欢迎回来，${res.user.nickname}！`, 'ok');
        }
        screen.remove();
        await onSuccess();
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        btn.disabled = false;
      }
    });
  };

  screen.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-mode]');
    if (tab) {
      mode = tab.dataset.mode;
      screen.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
      drawForm();
    }
  });

  drawForm();
  setTimeout(() => $('input', formBox)?.focus(), 80);
  return screen;
}

export function removeAuth() {
  $('#authScreen')?.remove();
}
