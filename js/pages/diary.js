/** 日记记录：时间线、筛选、搜索、照片、增删改 */
import {
  api, esc, num, fmtDate, fmtRelative, emptyHTML, avatarHTML, speciesEmoji, openModal, closeModal,
  confirmDialog, toast, inputField, selectField, textareaField, photoUploader, $, el, chipsHTML,
} from '../ui.js';
import { registerPage, state, refresh, withPet } from '../app.js';

const CATEGORIES = ['喂食', '便便', '遛弯', '玩耍', '洗澡', '训练', '心情', '就医', '其他'];
const MOODS = ['开心', '平常', '兴奋', '不适', '焦虑'];
const CAT_ICON = { 喂食: '🍚', 便便: '💩', 遛弯: '🦮', 玩耍: '🎾', 洗澡: '🛁', 训练: '🎓', 心情: '💗', 就医: '🏥', 其他: '📝' };

/** datetime-local 的输入值本身就是"用户本地时间"，按本地时间写入、按本地时间显示，整体一致 */
export const localToIso = (v) => (v && v.length === 16 ? `${v}:00.000Z` : v ? new Date(v).toISOString() : new Date().toISOString());
export const isoToLocalInput = (v) => (v ? String(v).slice(0, 16) : '');

export function diaryForm(entry, defaults = {}) {
  const isEdit = !!entry;
  const photos = photoUploader(entry?.photos || []);
  const petOptions = state.pets.map((p) => ({ value: p.id, label: `${speciesEmoji(p.species)} ${p.name}` }));
  const now = new Date();
  const localNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dtValue = entry?.happened_at ? isoToLocalInput(entry.happened_at) : localNow;

  openModal({
    title: isEdit ? '编辑日记' : '记一笔日常',
    submitText: isEdit ? '保存修改' : '保存记录',
    wide: true,
    body: `<div class="form-grid">
      ${selectField('宠物', 'pet_id', petOptions, { value: entry?.pet_id ?? defaults.pet_id ?? '' })}
      ${selectField('类型', 'category', CATEGORIES, { value: entry?.category || '喂食' })}
      ${inputField('时间', 'happened_at', { type: 'datetime-local', value: dtValue, required: true })}
      ${selectField('状态 / 心情', 'mood', MOODS, { value: entry?.mood || '开心' })}
      ${inputField('标题', 'title', { value: entry?.title || '', placeholder: '例如：早餐吃得干干净净', span: true })}
      ${textareaField('详情', 'content', { value: entry?.content || '', placeholder: '食欲、便便形态、精神状态、训练进展…' })}
    </div>`,
    onSubmit: async (data) => {
      const payload = {
        ...data,
        pet_id: Number(data.pet_id),
        photos: photos.get(),
        happened_at: localToIso(data.happened_at),
      };
      if (isEdit) await api.put(`/api/diary/${entry.id}`, payload);
      else await api.post('/api/diary', payload);
      closeModal();
      toast(isEdit ? '日记已更新' : '已记录这一笔', 'ok');
      await refresh();
    },
    onMount: (form) => {
      const wrap = el('<div></div>');
      wrap.appendChild(photos.node);
      $('.form-grid', form).appendChild(wrap);
      if (isEdit) {
        const del = el('<button type="button" class="btn danger">删除</button>');
        del.addEventListener('click', async () => {
          if (!(await confirmDialog('删除这条日记？照片也会一并删除。', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/diary/${entry.id}`);
          toast('已删除', 'ok');
          await refresh();
        });
        $('.modal-foot', form).prepend(del);
      }
    },
  });
}

registerPage('diary', {
  title: '日记记录',
  subtitle: () => '记录喂养、便便、玩耍、心情与就医的每一天',
  async render(view) {
    const f = state.filters.diary || (state.filters.diary = { category: '', q: '' });
    const params = new URLSearchParams();
    if (state.petId !== 'all') params.set('pet_id', state.petId);
    if (f.category) params.set('category', f.category);
    if (f.q) params.set('q', f.q);
    params.set('limit', '300');
    const res = await api.get(`/api/diary?${params}`);
    const items = res.items;

    // 按日期分组
    const groups = new Map();
    for (const it of items) {
      const key = String(it.happened_at).slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    const petName = new Map(state.pets.map((p) => [p.id, p]));

    view.innerHTML = `
      <div class="card tight" style="margin-bottom:14px">
        <div class="spread" style="flex-wrap:wrap">
          <div class="row">
            ${chipsHTML([{ value: '', label: '全部类型' }, ...CATEGORIES.map((c) => ({ value: c, label: `${CAT_ICON[c]} ${c}` }))], { active: f.category, action: 'cat' })}
          </div>
          <div class="row">
            <input class="input" id="diarySearch" placeholder="搜索标题或内容…" value="${esc(f.q)}" style="width:190px" />
            <button class="btn primary" data-action="new">＋ 写日记</button>
          </div>
        </div>
      </div>

      <div class="spread" style="margin-bottom:8px">
        <div class="muted small">共 <strong>${res.total}</strong> 条记录${state.petId !== 'all' ? `（${esc(petName.get(Number(state.petId))?.name || '')}）` : ''}</div>
        <div class="muted small">照片 ${items.reduce((s, i) => s + (i.photos?.length || 0), 0)} 张</div>
      </div>

      ${
        items.length
          ? [...groups.entries()]
              .map(
                ([date, list]) => `
        <div class="date-head">${esc(fmtDate(date))} <span class="muted small" style="font-weight:400">${esc(fmtRelative(`${date}T12:00:00`))} · ${list.length} 条</span></div>
        <div class="grid auto-260">
          ${list
            .map((it) => {
              const pet = petName.get(it.pet_id);
              return `<div class="card tight" data-id="${it.id}">
                <div class="spread" style="align-items:flex-start">
                  <div class="row tight">
                    <span class="chip pink">${CAT_ICON[it.category] || '📝'} ${esc(it.category)}</span>
                    ${it.mood ? `<span class="chip gray">${esc(it.mood)}</span>` : ''}
                  </div>
                  <span class="muted small mono">${esc(String(it.happened_at).slice(11, 16))}</span>
                </div>
                <h4 style="margin:9px 0 4px;font-size:15px">${esc(it.title || it.category)}</h4>
                ${it.content ? `<div class="small muted" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(it.content)}</div>` : ''}
                ${it.photos?.length ? `<div class="thumb-strip" style="margin-top:9px" data-photo-group>${it.photos.map((u) => `<div class="thumb" data-photo="${esc(u)}" style="width:58px;height:58px"><img src="${esc(u)}" alt="照片" /></div>`).join('')}</div>` : ''}
                <div class="spread" style="margin-top:11px">
                  <span class="row tight">${pet ? `<span class="chip gray">${speciesEmoji(pet.species)} ${esc(pet.name)}</span>` : ''}</span>
                  <span class="row tight">
                    <button class="btn sm ghost" data-action="edit" data-id="${it.id}">编辑</button>
                    <button class="btn sm ghost" data-action="del" data-id="${it.id}">删除</button>
                  </span>
                </div>
              </div>`;
            })
            .join('')}
        </div>`
              )
              .join('')
          : emptyHTML('还没有日记，点「写日记」记录第一笔吧', '📔')
      }
    `;

    const search = $('#diarySearch', view);
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.filters.diary.q = search.value.trim();
        refresh();
      }, 350);
    });

    view.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      const chip = e.target.closest('.chip.clickable');
      const id = e.target.closest('[data-action]')?.dataset.id;
      try {
        if (chip && chip.dataset.name === 'chip') {
          state.filters.diary.category = chip.dataset.value;
          return refresh();
        }
        if (action === 'new') return diaryForm(null);
        if (action === 'edit') return diaryForm(items.find((i) => String(i.id) === String(id)));
        if (action === 'del') {
          if (!(await confirmDialog('删除这条日记？照片也会一并删除。', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/diary/${id}`);
          toast('已删除', 'ok');
          return refresh();
        }
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  },
});
