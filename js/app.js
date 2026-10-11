/** 应用外壳：状态、路由、导航、宠物筛选、全局快捷记录 */
import {
  $, $$, el, toast, closeModal, openModal, initLightbox, api, esc, fmtRelative, todayStr,
  inputField, selectField, textareaField, photoUploader, speciesEmoji, num, avatarHTML,
} from './ui.js';

/* ------------------------------ 全局状态 ------------------------------ */
export const state = {
  route: (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0],
  petId: localStorage.getItem('petId') || 'all',
  pets: [],
  meta: null,
  data: {},
  filters: {},
};

export function savePetFilter() {
  localStorage.setItem('petId', state.petId);
}

export function activePet() {
  return state.pets.find((p) => String(p.id) === String(state.petId)) || null;
}

export function petFilter() {
  return state.petId && state.petId !== 'all' ? `pet_id=${state.petId}` : '';
}

export function withPet(url) {
  const f = petFilter();
  if (!f) return url;
  return url.includes('?') ? `${url}&${f}` : `${url}?${f}`;
}

/* ------------------------------ 路由表 ------------------------------ */
const routes = new Map();
let currentCleanup = null;

export function registerPage(name, def) {
  routes.set(name, def);
}

export function navigate(route) {
  location.hash = `#/${route}`;
}

export async function refresh() {
  const page = routes.get(state.route) || routes.get('dashboard');
  const view = $('#view');
  $('#pageTitle').textContent = page.title;
  $('#pageSub').textContent = page.subtitle ? page.subtitle() : '';
  currentCleanup?.();
  currentCleanup = null;
  view.innerHTML = `<div class="empty">正在加载…</div>`;
  try {
    const cleanup = await page.render(view);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty"><span class="big">😿</span>加载失败：${esc(err.message)}</div>`;
  }
  renderNav();
}

/* ------------------------------ 导航 ------------------------------ */
export const NAV = [
  { group: '日常' },
  { key: 'dashboard', label: '总览', icon: '🏠' },
  { key: 'pets', label: '宠物档案', icon: '🐾' },
  { key: 'diary', label: '日记记录', icon: '📔' },
  { key: 'health', label: '健康管理', icon: '💉' },
  { group: '饮食' },
  { key: 'feeding', label: '喂食计划', icon: '🍚' },
  { key: 'recipes', label: '猫饭狗饭', icon: '🍲' },
  { group: '其他' },
  { key: 'reminders', label: '提醒待办', icon: '⏰', badge: true },
  { key: 'albums', label: '相册', icon: '🖼️' },
  { key: 'settings', label: '数据中心', icon: '⚙️' },
];

const TAB_KEYS = ['dashboard', 'diary', 'health', 'feeding', 'recipes'];

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = NAV.map((item) => {
    if (item.group) return `<div class="nav-group">${esc(item.group)}</div>`;
    const active = state.route === item.key ? 'active' : '';
    const badge = item.badge && state.badgeCount ? `<span class="badge">${state.badgeCount}</span>` : '';
    return `<a class="nav-item ${active}" href="#/${item.key}"><span class="ico">${item.icon}</span><span>${esc(item.label)}</span>${badge}</a>`;
  }).join('');

  const tabbar = $('#tabbar');
  tabbar.innerHTML = TAB_KEYS.map((key) => {
    const item = NAV.find((n) => n.key === key);
    return `<button class="${state.route === key ? 'active' : ''}" data-tab="${key}">
      <span class="ico">${item.icon}</span><span>${esc(item.label)}</span></button>`;
  }).join('');
}

/* --------------------------- 宠物筛选器 --------------------------- */
export async function loadPets() {
  const res = await api.get('/api/pets');
  state.pets = res.items;
  const sel = $('#petSwitcher');
  sel.innerHTML = [
    `<option value="all">🐾 全部宠物</option>`,
    ...state.pets.map((p) => `<option value="${p.id}">${p.species === '猫' ? '🐱' : p.species === '狗' ? '🐶' : '🐰'} ${esc(p.name)}</option>`),
  ].join('');
  if (!state.pets.some((p) => String(p.id) === String(state.petId))) state.petId = 'all';
  sel.value = state.petId;
  syncPetSwitcherLabel();
}

/** 移动端：用按钮 + 弹窗选择，避免与标题争宽度 */
export function syncPetSwitcherLabel() {
  const btn = $('#petSwitcherBtn');
  if (!btn) return;
  const pet = activePet();
  btn.textContent = pet ? `${speciesEmoji(pet.species)} ${pet.name}` : '🐾 全部';
}

function petSwitcherModal() {
  openModal({
    title: '按宠物筛选',
    body: `<div class="list">
      <div class="list-item" data-pick="all" style="cursor:pointer">
        <span class="chip ${state.petId === 'all' ? 'active' : 'gray'}">🐾</span>
        <div class="grow"><div class="title">全部宠物</div><div class="muted small">显示所有毛孩子的数据</div></div>
      </div>
      ${state.pets
        .map(
          (p) => `<div class="list-item" data-pick="${p.id}" style="cursor:pointer">
            ${avatarHTML(p, 'sm')}
            <div class="grow"><div class="title">${esc(p.name)} <span class="chip gray">${esc(p.species)}</span></div>
              <div class="muted small">${esc(p.breed || '')} · ${num(p.weight, 2)} kg</div></div>
            ${String(state.petId) === String(p.id) ? '<span class="chip active">当前</span>' : ''}
          </div>`
        )
        .join('')}
    </div>`,
  });
  $('#modalRoot').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-pick]');
    if (!row) return;
    state.petId = row.dataset.pick;
    savePetFilter();
    closeModal();
    await refresh();
  });
}

/* ------------------------------ 快捷记录 ------------------------------ */
export function quickDiaryModal(presetPetId) {
  const petOptions = state.pets.map((p) => ({ value: p.id, label: `${p.species === '猫' ? '🐱' : p.species === '狗' ? '🐶' : '🐰'} ${p.name}` }));
  if (!petOptions.length) {
    toast('请先添加一只宠物', 'err');
    navigate('pets');
    return;
  }
  const now = new Date();
  const localNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const photos = photoUploader([]);
  const node = openModal({
    title: '记一笔日常',
    submitText: '保存记录',
    body: `<div class="form-grid">
      ${selectField('宠物', 'pet_id', petOptions, { value: presetPetId || state.petId !== 'all' ? state.petId : petOptions[0].value })}
      ${selectField('类型', 'category', ['喂食', '便便', '遛弯', '玩耍', '洗澡', '训练', '心情', '就医', '其他'], { value: '喂食' })}
      ${inputField('时间', 'happened_at', { type: 'datetime-local', value: localNow, required: true })}
      ${selectField('状态 / 心情', 'mood', ['开心', '平常', '兴奋', '不适', '焦虑'], { value: '开心' })}
      ${inputField('标题', 'title', { placeholder: '例如：早餐吃得干干净净', span: true })}
      ${textareaField('详情', 'content', { placeholder: '记录今天的表现、食欲、便便情况…' })}
    </div>`,
    onSubmit: async (data) => {
      if (!data.pet_id) throw new Error('请选择宠物');
      await api.post('/api/diary', {
        ...data,
        pet_id: Number(data.pet_id),
        photos: photos.get(),
        happened_at: data.happened_at?.length === 16 ? `${data.happened_at}:00.000Z` : new Date(data.happened_at || Date.now()).toISOString(),
      });
      closeModal();
      toast('已记录，真棒！', 'ok');
      await refresh();
    },
    onMount: (form) => form.insertBefore(photos.node, form.querySelector('.modal-foot')),
  });
  return node;
}

/* ------------------------------ 账号 ------------------------------ */

/** 侧边栏底部显示当前账号 */
export function renderUserChip(user) {
  const chip = $('#userChip');
  if (!chip) return;
  if (!user) {
    $('#userName').textContent = '未登录';
    $('#userRole').textContent = '—';
    $('#userAvatar').innerHTML = '🐾';
    return;
  }
  const name = user.nickname || user.username;
  $('#userName').textContent = name;
  $('#userRole').textContent = user.role === 'admin' ? '管理员' : '普通账号';
  $('#userAvatar').innerHTML = user.avatar ? `<img src="${esc(user.avatar)}" alt="${esc(name)}" />` : esc(name.slice(0, 1));
  chip.title = `${user.username}${user.email ? ` · ${user.email}` : ''}（点击打开账号设置）`;
}

function accountModal() {
  const u = state.user || {};
  openModal({
    title: '账号设置',
    wide: true,
    body: `<div class="stack">
      <div class="row" style="gap:14px;flex-wrap:nowrap;align-items:center">
        <div class="user-avatar" style="width:56px;height:56px;font-size:24px;border-radius:18px">
          ${u.avatar ? `<img src="${esc(u.avatar)}" alt="${esc(u.nickname || u.username)}" />` : esc((u.nickname || u.username || '宠').slice(0, 1))}
        </div>
        <div>
          <h3 style="font-size:17px">${esc(u.nickname || u.username || '')}</h3>
          <div class="muted small">用户名 ${esc(u.username || '')} · ${u.role === 'admin' ? '管理员' : '普通账号'}</div>
        </div>
        <button class="btn danger" style="margin-left:auto" data-act="logout">退出登录</button>
      </div>

      <div class="date-head">修改资料</div>
      <form id="profileForm" class="form-grid">
        <div class="field"><label>昵称</label><input class="input" name="nickname" value="${esc(u.nickname || '')}" maxlength="30" /></div>
        <div class="field"><label>邮箱（选填）</label><input class="input" name="email" value="${esc(u.email || '')}" placeholder="用于找回账号时联系" /></div>
        <div class="span-2"><button class="btn primary" type="submit">保存资料</button></div>
      </form>

      <div class="date-head">修改密码</div>
      <form id="passwordForm" class="form-grid">
        <div class="field span-2"><label>当前密码</label><input class="input" name="old_password" type="password" autocomplete="current-password" required /></div>
        <div class="field"><label>新密码（至少 8 位）</label><input class="input" name="new_password" type="password" autocomplete="new-password" required /></div>
        <div class="field"><label>确认新密码</label><input class="input" name="new_password2" type="password" autocomplete="new-password" required /></div>
        <div class="span-2"><button class="btn" type="submit">修改密码</button></div>
      </form>
    </div>`,
    onMount: (form, modal) => {
      $('#profileForm', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        const updated = await api.put('/api/auth/profile', data);
        state.user = updated;
        renderUserChip(updated);
        toast('资料已更新', 'ok');
      });
      $('#passwordForm', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        if (data.new_password !== data.new_password2) return toast('两次输入的新密码不一致', 'err');
        await api.post('/api/auth/password', { old_password: data.old_password, new_password: data.new_password });
        e.target.reset();
        toast('密码已修改，其他设备上的登录仍然有效', 'ok');
      });
      modal.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-act=logout]')) return;
        await api.post('/api/auth/logout');
        toast('已退出登录');
        location.reload();
      });
    },
  });
}

/* ------------------------------ 启动 ------------------------------ */
async function boot() {
  initLightbox();
  renderNav();

  $('#petSwitcher').addEventListener('change', async (e) => {
    state.petId = e.target.value;
    savePetFilter();
    await refresh();
  });
  $('#quickAdd').addEventListener('click', () => quickDiaryModal());
  $('#petSwitcherBtn').addEventListener('click', () => petSwitcherModal());
  $('#userChip').addEventListener('click', () => accountModal());
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#tabbar').addEventListener('click', (e) => {
    const key = e.target.closest('[data-tab]')?.dataset.tab;
    if (key) navigate(key);
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item')) $('#sidebar').classList.remove('open');
  });

  window.addEventListener('hashchange', async () => {
    if (!state.user) return;
    state.route = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
    if (!routes.has(state.route)) state.route = 'dashboard';
    await refresh();
  });

  // 会话失效（Cookie 过期 / 被停用 / 服务重启）→ 回到登录页
  window.addEventListener('pd:unauthorized', async () => {
    if (!state.user) return;
    state.user = null;
    renderUserChip(null);
    const { renderAuth } = await import('./auth-screen.js');
    const status = await api.get('/api/auth/status').catch(() => ({ registration_open: true, user_count: 1 }));
    renderAuth(status, () => location.reload());
  });

  // 动态加载页面模块
  await Promise.all([
    import('./pages/dashboard.js'),
    import('./pages/pets.js'),
    import('./pages/diary.js'),
    import('./pages/health.js'),
    import('./pages/feeding.js'),
    import('./pages/recipes.js'),
    import('./pages/reminders.js'),
    import('./pages/albums.js'),
    import('./pages/settings.js'),
  ]);

  // 自动化截图辅助：仅当服务器开启了调试通道时，页面会带上 click 参数
  let autoClick = null;
  {
    const params = new URLSearchParams(location.search);
    if (params.get('t') && params.get('click')) {
      autoClick = decodeURIComponent(params.get('click')).split('|');
      history.replaceState(null, '', location.pathname + location.hash);
    }
  }

  // 先确认登录状态，未登录直接显示登录页，不请求任何业务数据
  const status = await api.get('/api/auth/status').catch(() => ({ user: null, registration_open: true, user_count: 0 }));
  if (!status.user) {
    const { renderAuth } = await import('./auth-screen.js');
    renderAuth(status, () => location.reload());
    return;
  }
  state.user = status.user;
  state.authStatus = status;
  renderUserChip(status.user);

  try {
    state.meta = await api.get('/api/meta');
    await loadPets();
    const dash = await api.get('/api/dashboard');
    state.badgeCount = dash.upcoming.filter((u) => u.overdue || u.days <= 7).length;
  } catch (err) {
    toast(`初始化失败：${err.message}`, 'err');
  }

  if (!location.hash) location.hash = '#/dashboard';
  await refresh();

  if (autoClick) {
    for (const selector of autoClick) {
      const target = document.querySelector(selector);
      if (target) {
        target.click();
        break;
      }
    }
  }
}

boot();
