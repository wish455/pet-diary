/** 提醒待办：疫苗 / 驱虫 / 洗澡 / 复诊等周期性提醒 */
import {
  api, esc, num, dueMeta, emptyHTML, speciesEmoji, statHTML, openModal, closeModal,
  confirmDialog, toast, inputField, selectField, textareaField, $, el, chipsHTML, todayStr,
} from '../ui.js';
import { registerPage, state, refresh, loadPets } from '../app.js';

const TYPES = ['疫苗', '驱虫', '洗澡', '剪指甲', '复诊', '喂药', '生日', '其他'];
const TYPE_ICON = { 疫苗: '💉', 驱虫: '🪱', 洗澡: '🛁', 剪指甲: '✂️', 复诊: '🏥', 喂药: '💊', 生日: '🎂', 其他: '📌' };

export function reminderForm(item) {
  const isEdit = !!item;
  const petOptions = [{ value: '', label: '不关联宠物' }, ...state.pets.map((p) => ({ value: p.id, label: `${speciesEmoji(p.species)} ${p.name}` }))];
  openModal({
    title: isEdit ? '编辑提醒' : '新增提醒',
    submitText: '保存',
    body: `<div class="form-grid">
      ${inputField('提醒内容', 'title', { value: item?.title || '', required: true, placeholder: '例如：体内外驱虫（每月）', span: true })}
      ${selectField('宠物', 'pet_id', petOptions, { value: item?.pet_id ?? (state.petId !== 'all' ? state.petId : '') })}
      ${selectField('类型', 'type', TYPES, { value: item?.type || '其他' })}
      ${inputField('到期日', 'due_date', { type: 'date', value: item?.due_date || todayStr(), required: true })}
      ${inputField('重复间隔（天，0=不重复）', 'repeat_days', { type: 'number', value: item?.repeat_days ?? 0, hint: '例如 30 表示每 30 天一次，完成后自动顺延下次' })}
      ${textareaField('备注', 'note', { value: item?.note || '', placeholder: '用药剂量、医院电话、注意事项…', rows: 3 })}
    </div>`,
    onSubmit: async (data) => {
      const payload = {
        title: data.title,
        pet_id: data.pet_id ? Number(data.pet_id) : null,
        type: data.type,
        due_date: data.due_date,
        repeat_days: Number(data.repeat_days) || 0,
        note: data.note,
      };
      if (isEdit) await api.put(`/api/reminders/${item.id}`, payload);
      else await api.post('/api/reminders', payload);
      closeModal();
      toast(isEdit ? '提醒已更新' : '提醒已创建', 'ok');
      await refresh();
    },
    onMount: (form) => {
      if (isEdit) {
        const del = el('<button type="button" class="btn danger">删除</button>');
        del.addEventListener('click', async () => {
          if (!(await confirmDialog('删除这条提醒？', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/reminders/${item.id}`);
          toast('已删除', 'ok');
          await refresh();
        });
        $('.modal-foot', form).prepend(del);
      }
    },
  });
}

registerPage('reminders', {
  title: '提醒待办',
  subtitle: () => '疫苗、驱虫、洗澡、复诊再也不会忘',
  async render(view) {
    const f = state.filters.reminders || (state.filters.reminders = { type: '', show: 'pending' });
    const res = await api.get('/api/reminders?limit=500');
    const all = res.items;
    const petName = new Map(state.pets.map((p) => [p.id, p]));

    let items = all;
    if (state.petId !== 'all') items = items.filter((r) => String(r.pet_id) === String(state.petId));
    if (f.type) items = items.filter((r) => r.type === f.type);
    if (f.show === 'pending') items = items.filter((r) => !r.done);
    if (f.show === 'done') items = items.filter((r) => r.done);

    const overdue = items.filter((r) => !r.done && r.due_date < todayStr());
    const todayItems = items.filter((r) => !r.done && r.due_date === todayStr());
    const soon = items.filter((r) => !r.done && r.due_date > todayStr() && r.due_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    const later = items.filter((r) => !r.done && r.due_date > new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    const done = items.filter((r) => r.done);

    const group = (title, list, icon) =>
      list.length
        ? `<div class="date-head">${icon} ${esc(title)} <span class="muted small" style="font-weight:400">${list.length} 项</span></div>
          <div class="list">${list.map(rowHTML).join('')}</div>`
        : '';

    function rowHTML(r) {
      const meta = dueMeta(r.due_date);
      const pet = petName.get(r.pet_id);
      return `<div class="list-item ${r.done ? '' : meta.cls}">
        <span class="chip ${r.done ? 'gray' : meta.tone === 'red' ? 'red' : meta.tone === 'amber' ? 'amber' : 'blue'}">${TYPE_ICON[r.type] || '📌'} ${esc(r.type)}</span>
        <div class="grow">
          <div class="title" style="${r.done ? 'text-decoration:line-through;opacity:.65' : ''}">${esc(r.title)}</div>
          <div class="muted small">
            ${esc(r.due_date)}${r.repeat_days ? ` · 每 ${r.repeat_days} 天重复` : ''}
            ${r.done ? ` · 已完成 ${esc(String(r.done_at).slice(0, 10))}` : ` · ${esc(meta.text)}`}
            ${pet ? ` · ${speciesEmoji(pet.species)} ${esc(pet.name)}` : ''}
          </div>
          ${r.note ? `<div class="small muted" style="margin-top:3px">${esc(r.note)}</div>` : ''}
        </div>
        <div class="row tight">
          <button class="btn sm ${r.done ? '' : 'primary'}" data-action="toggle" data-id="${r.id}">${r.done ? '恢复' : r.repeat_days ? '已完成·顺延' : '完成'}</button>
          <button class="btn sm ghost" data-action="edit" data-id="${r.id}">编辑</button>
        </div>
      </div>`;
    }

    view.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px">
        ${statHTML('🔥', overdue.length, '已逾期', 'red')}
        ${statHTML('📅', todayItems.length, '今天到期')}
        ${statHTML('⏳', soon.length, '7 天内')}
        ${statHTML('✅', all.filter((r) => r.done).length, '已完成')}
      </div>

      <div class="card tight" style="margin-bottom:16px">
        <div class="spread" style="flex-wrap:wrap;gap:10px">
          <div class="stack sm" style="gap:8px">
            ${chipsHTML(
              [
                { value: 'pending', label: '待办' },
                { value: 'done', label: '已完成' },
                { value: 'all', label: '全部' },
              ],
              { active: f.show, action: 'show', name: 'show' }
            )}
            ${chipsHTML([{ value: '', label: '全部类型' }, ...TYPES.map((t) => ({ value: t, label: `${TYPE_ICON[t]} ${t}` }))], { active: f.type, action: 'type', name: 'type' })}
          </div>
          <button class="btn primary" data-action="new">＋ 新增提醒</button>
        </div>
      </div>

      ${
        items.length
          ? `${group('已逾期', overdue, '🔥')}${group('今天到期', todayItems, '📅')}${group('7 天内', soon, '⏳')}${group('更晚', later, '🗓️')}${group('已完成', done, '✅')}`
          : emptyHTML('没有符合条件的提醒，清爽！', '🌿')
      }
    `;

    view.addEventListener('click', async (e) => {
      const chip = e.target.closest('.chip.clickable');
      if (chip) {
        state.filters.reminders[chip.dataset.name] = chip.dataset.value;
        return refresh();
      }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      try {
        if (action === 'new') return reminderForm(null);
        if (action === 'edit') return reminderForm(all.find((r) => String(r.id) === String(id)));
        if (action === 'toggle') {
          const updated = await api.post(`/api/reminders/${id}/complete`);
          toast(updated.done ? '已标记完成' : updated.repeat_days ? `已完成，下次 ${updated.due_date}` : '已恢复', 'ok');
          return refresh();
        }
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  },
});
