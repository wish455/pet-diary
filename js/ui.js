/** 通用 UI 与工具：API 客户端、格式化、模态框、提示、上传、DOM 助手 */

/* ------------------------------ API ------------------------------ */

async function request(method, url, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    // 会话失效：通知外壳切回登录页
    window.dispatchEvent(new CustomEvent('pd:unauthorized'));
  }
  if (!res.ok || (payload && payload.ok === false)) {
    const err = new Error((payload && payload.error) || `请求失败 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return payload ? payload.data : null;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  upload: async (files) => {
    const fd = new FormData();
    for (const f of files) fd.append('file', f, f.name);
    return request('POST', '/api/upload', fd, true);
  },
};

/* ---------------------------- 日期与格式 ---------------------------- */

export const pad = (n) => String(n).padStart(2, '0');
export const todayStr = () => new Date().toISOString().slice(0, 10);

export function fmtDate(v, withTime = false) {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${base} ${pad(d.getHours())}:${pad(d.getMinutes())}` : base;
}

export function fmtRelative(v) {
  if (!v) return '';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.round((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  if (diff > 2 && diff < 30) return `${diff} 天前`;
  if (diff < 0 && diff > -30) return `${-diff} 天后`;
  return fmtDate(v);
}

export function weekdayName(v) {
  const d = new Date(`${v}T00:00:00`);
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] || '';
}

export function num(v, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function dueMeta(dueDate) {
  if (!dueDate) return { cls: '', text: '' };
  const diff = Math.round((new Date(`${dueDate}T00:00:00`) - new Date(`${todayStr()}T00:00:00`)) / 86400000);
  if (diff < 0) return { cls: 'overdue', text: `已逾期 ${-diff} 天`, tone: 'red' };
  if (diff === 0) return { cls: 'soon', text: '今天到期', tone: 'amber' };
  if (diff <= 7) return { cls: 'soon', text: `${diff} 天后`, tone: 'amber' };
  return { cls: '', text: `${diff} 天后`, tone: 'gray' };
}

export function speciesEmoji(species) {
  return { 猫: '🐱', 狗: '🐶', 其他: '🐰' }[species] || '🐾';
}

/* ---------------------------- DOM 助手 ---------------------------- */

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function toast(message, type = '') {
  const wrap = $('#toastWrap');
  const node = el(`<div class="toast ${type}">${esc(message)}</div>`);
  wrap.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 260);
  }, 2600);
}

/* ----------------------------- 模态框 ----------------------------- */

let activeModal = null;

export function openModal({ title, body, submitText = '保存', onSubmit, wide = false, onMount }) {
  closeModal();
  const root = $('#modalRoot');
  const node = el(`
    <div>
      <div class="modal-mask" data-close="1"></div>
      <div class="modal" style="${wide ? 'width:min(880px, calc(100vw - 32px))' : ''}">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="x" data-close="1" aria-label="关闭">✕</button>
        </div>
        <form class="modal-body"></form>
      </div>
    </div>`);
  const form = $('form', node);
  form.innerHTML = typeof body === 'string' ? body : '';
  if (typeof body !== 'string' && body instanceof HTMLElement) form.appendChild(body);

  if (onSubmit) {
    form.appendChild(
      el(`<div class="modal-foot">
        <button type="button" class="btn" data-close="1">取消</button>
        <button type="submit" class="btn primary">${esc(submitText)}</button>
      </div>`)
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        await onSubmit(data, form);
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        btn.disabled = false;
      }
    });
  }

  node.addEventListener('click', (e) => {
    if (e.target.dataset.close) closeModal();
  });
  root.innerHTML = '';
  root.appendChild(node);
  root.classList.add('open');
  activeModal = node;
  onMount?.(form, node);
  const first = $('input:not([type=hidden]), textarea, select', form);
  setTimeout(() => first?.focus(), 60);
  return node;
}

export function closeModal() {
  const root = $('#modalRoot');
  if (!root) return;
  root.classList.remove('open');
  root.innerHTML = '';
  activeModal = null;
}

export function confirmDialog(message, { title = '确认操作', danger = false, submitText = '确认' } = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: `<p style="margin:0 0 6px">${esc(message)}</p>`,
      submitText,
      onSubmit: async () => {
        closeModal();
        resolve(true);
      },
    });
    const node = activeModal;
    if (danger) $('button[type=submit]', node)?.classList.add('danger');
    node.addEventListener('click', (e) => {
      if (e.target.dataset.close) resolve(false);
    });
  });
}

/* ------------------------------ 表单 ------------------------------ */

export function field(label, control, hint = '') {
  return `<div class="field"><label>${esc(label)}</label>${control}${hint ? `<span class="muted small">${esc(hint)}</span>` : ''}</div>`;
}

export function inputField(label, name, { value = '', type = 'text', placeholder = '', required = false, step = '', span = false } = {}) {
  return `<div class="field${span ? ' span-2' : ''}">
    <label>${esc(label)}</label>
    <input class="input" type="${type}" name="${name}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${step ? `step="${step}"` : ''} />
  </div>`;
}

export function selectField(label, name, options, { value = '', span = false } = {}) {
  const opts = options
    .map((o) => {
      const v = typeof o === 'string' ? o : o.value;
      const t = typeof o === 'string' ? o : o.label;
      return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`;
    })
    .join('');
  return `<div class="field${span ? ' span-2' : ''}"><label>${esc(label)}</label><select class="input" name="${name}">${opts}</select></div>`;
}

export function textareaField(label, name, { value = '', placeholder = '', span = true, rows = 4 } = {}) {
  return `<div class="field${span ? ' span-2' : ''}">
    <label>${esc(label)}</label>
    <textarea class="textarea" name="${name}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value ?? '')}</textarea>
  </div>`;
}

export function checkboxField(label, name, checked = false, span = true) {
  return `<div class="field${span ? ' span-2' : ''}">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" name="${name}" ${checked ? 'checked' : ''} style="width:18px;height:18px" /> ${esc(label)}
    </label>
  </div>`;
}

/** 照片上传组件：返回渲染函数与读取当前值的 getter */
export function photoUploader(initial = [], { multiple = true } = {}) {
  let photos = [...initial];
  const wrap = el(`<div class="stack sm">
    <label class="small" style="font-weight:700;color:#5f5975">照片</label>
    <div class="thumb-strip"></div>
    <label class="uploader">📷 点击选择${multiple ? '（可多选）' : ''}图片
      <input type="file" accept="image/*" ${multiple ? 'multiple' : ''} hidden />
    </label>
    <span class="muted small">支持 JPG/PNG/WebP，单张建议小于 5MB</span>
  </div>`);
  const strip = $('.thumb-strip', wrap);
  const input = $('input[type=file]', wrap);

  const render = () => {
    strip.innerHTML = photos
      .map(
        (p, i) => `<div class="thumb"><img src="${esc(p)}" alt="照片" /><button type="button" class="del" data-i="${i}">✕</button></div>`
      )
      .join('');
  };
  strip.addEventListener('click', (e) => {
    const i = e.target.dataset.i;
    if (i === undefined) return;
    photos.splice(Number(i), 1);
    render();
  });
  input.addEventListener('change', async () => {
    if (!input.files?.length) return;
    try {
      const res = await api.upload(Array.from(input.files).slice(0, multiple ? 9 : 1));
      photos.push(...res.files.map((f) => f.url));
      if (!multiple) photos = photos.slice(-1);
      render();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      input.value = '';
    }
  });
  render();
  return { node: wrap, get: () => photos };
}

/* ------------------------------ 灯箱 ------------------------------ */

export function initLightbox() {
  const box = $('#lightbox');
  const img = $('#lightboxImg');
  let list = [];
  let index = 0;

  const show = (i) => {
    index = (i + list.length) % list.length;
    img.src = list[index];
  };
  document.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-photo]');
    if (!cell) return;
    const group = cell.closest('[data-photo-group]');
    list = group ? $$('[data-photo]', group).map((n) => n.dataset.photo) : [cell.dataset.photo];
    show(list.indexOf(cell.dataset.photo));
    box.hidden = false;
  });
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.classList.contains('lightbox-close')) {
      box.hidden = true;
      return;
    }
    if (e.target.classList.contains('prev')) show(index - 1);
    if (e.target.classList.contains('next')) show(index + 1);
  });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') box.hidden = true;
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
}

/* --------------------------- 通用渲染片段 --------------------------- */

export function avatarHTML(pet, size = 'md') {
  const emoji = speciesEmoji(pet?.species);
  if (pet?.avatar) return `<div class="avatar ${size}"><img src="${esc(pet.avatar)}" alt="${esc(pet.name || '')}" /></div>`;
  return `<div class="avatar ${size}">${emoji}</div>`;
}

export function emptyHTML(text, icon = '🐾') {
  return `<div class="empty"><span class="big">${icon}</span>${esc(text)}</div>`;
}

export function statHTML(icon, value, label, tone = '') {
  return `<div class="stat"><div class="ico">${icon}</div><div>
    <div class="num">${esc(value)}</div><div class="lbl">${esc(label)}</div></div></div>`;
}

export function chipsHTML(items, { name = 'chip', active = '', action = '' } = {}) {
  return `<div class="pill-row">${items
    .map((it) => {
      const v = typeof it === 'string' ? it : it.value;
      const t = typeof it === 'string' ? it : it.label;
      return `<span class="chip clickable ${String(v) === String(active) ? 'active' : ''}" ${action ? `data-action="${action}" data-value="${esc(v)}"` : ''} data-name="${name}">${esc(t)}</span>`;
    })
    .join('')}</div>`;
}
