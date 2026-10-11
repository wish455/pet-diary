/** 宠物档案：卡片列表、新增/编辑、详情总览 */
import {
  api, esc, num, fmtDate, fmtRelative, emptyHTML, avatarHTML, speciesEmoji, statHTML, dueMeta,
  openModal, closeModal, confirmDialog, toast, inputField, selectField, textareaField, checkboxField, photoUploader, el, $, todayStr,
} from '../ui.js';
import { lineChart } from '../charts.js';
import { registerPage, state, refresh, loadPets, navigate, quickDiaryModal } from '../app.js';

const SPECIES = ['猫', '狗', '其他'];
const GENDERS = ['公', '母', '未知'];
const STATUSES = ['在身边', '已送养', '已离开'];

export function petForm(pet) {
  const isEdit = !!pet;
  const avatar = photoUploader(pet?.avatar ? [pet.avatar] : [], { multiple: false });
  const node = openModal({
    title: isEdit ? `编辑「${pet.name}」的档案` : '添加宠物档案',
    submitText: isEdit ? '保存修改' : '创建档案',
    wide: true,
    body: `<div class="form-grid">
      ${inputField('名字', 'name', { value: pet?.name || '', required: true, placeholder: '例如：咪咪' })}
      ${selectField('种类', 'species', SPECIES, { value: pet?.species || '猫' })}
      ${inputField('品种', 'breed', { value: pet?.breed || '', placeholder: '例如：中华田园猫 / 柯基' })}
      ${selectField('性别', 'gender', GENDERS, { value: pet?.gender || '未知' })}
      ${inputField('生日', 'birthday', { type: 'date', value: pet?.birthday || '' })}
      ${inputField('到家日期', 'adopt_date', { type: 'date', value: pet?.adopt_date || '' })}
      ${inputField('当前体重（kg）', 'weight', { type: 'number', step: '0.01', value: pet?.weight ?? '', placeholder: '4.2' })}
      ${inputField('毛色 / 特征', 'color', { value: pet?.color || '', placeholder: '例如：橘白、三色' })}
      ${inputField('芯片号', 'chip_no', { value: pet?.chip_no || '', placeholder: '选填' })}
      ${selectField('状态', 'status', STATUSES, { value: pet?.status || '在身边' })}
      ${inputField('排序（数字小的排前面）', 'sort', { type: 'number', value: pet?.sort ?? 0 })}
      ${checkboxField('已绝育', 'sterilized', !!pet?.sterilized, false)}
      ${textareaField('备注', 'note', { value: pet?.note || '', placeholder: '性格、饮食偏好、过敏史、就医习惯…' })}
    </div>`,
    onSubmit: async (data) => {
      const payload = {
        ...data,
        weight: data.weight === '' ? null : Number(data.weight),
        sort: Number(data.sort) || 0,
        sterilized: data.sterilized ? 1 : 0,
        avatar: avatar.get()[0] || '',
      };
      if (isEdit) await api.put(`/api/pets/${pet.id}`, payload);
      else await api.post('/api/pets', payload);
      closeModal();
      toast(isEdit ? '档案已更新' : '宠物档案已创建', 'ok');
      await loadPets();
      await refresh();
    },
    onMount: (form) => {
      const foot = $('.modal-foot', form);
      if (isEdit) {
        const del = el('<button type="button" class="btn danger">删除档案</button>');
        del.addEventListener('click', async () => {
          const okDel = await confirmDialog(`确定删除「${pet.name}」的档案吗？该宠物的日记、健康记录、喂食计划与提醒都会被一并删除，且无法恢复。`, { danger: true, submitText: '删除' });
          if (!okDel) return;
          await api.del(`/api/pets/${pet.id}`);
          toast('档案已删除', 'ok');
          await loadPets();
          await refresh();
        });
        foot.prepend(del);
      }
      const wrap = el('<div></div>');
      wrap.appendChild(avatar.node);
      $('.form-grid', form).appendChild(wrap);
    },
  });
  return node;
}

async function petDetailModal(id) {
  const d = await api.get(`/api/pets/${id}/detail`);
  const p = d.pet;
  const weights = d.weights.map((w) => ({ label: w.date, value: w.weight }));
  const upcoming = d.reminders.filter((r) => !r.done).slice(0, 4);
  const nextHealth = d.health.filter((h) => h.next_due).sort((a, b) => (a.next_due > b.next_due ? 1 : -1)).slice(0, 4);

  openModal({
    title: `${speciesEmoji(p.species)} ${p.name} 的档案`,
    wide: true,
    body: `<div class="stack">
      <div class="row" style="align-items:flex-start;gap:16px;flex-wrap:nowrap">
        ${avatarHTML(p, 'xl')}
        <div class="grow" style="min-width:0;flex:1">
          <div class="row tight" style="margin-bottom:6px">
            <span class="chip pink">${esc(p.species)}</span>
            <span class="chip gray">${esc(p.breed || '品种未知')}</span>
            <span class="chip blue">${esc(p.gender)}</span>
            ${p.sterilized ? '<span class="chip green">已绝育</span>' : '<span class="chip amber">未绝育</span>'}
            <span class="chip ${p.status === '在身边' ? 'green' : 'gray'}">${esc(p.status)}</span>
          </div>
          <div class="grid cols-2" style="gap:8px">
            <div class="small"><span class="muted">年龄</span> · <strong>${esc(p.age_text)}</strong></div>
            <div class="small"><span class="muted">生日</span> · ${esc(p.birthday || '未填写')}</div>
            <div class="small"><span class="muted">到家</span> · ${esc(p.adopt_date || '未填写')}</div>
            <div class="small"><span class="muted">当前体重</span> · <strong>${num(p.weight, 2)} kg</strong></div>
            <div class="small"><span class="muted">毛色</span> · ${esc(p.color || '未填写')}</div>
            <div class="small"><span class="muted">芯片号</span> · ${esc(p.chip_no || '未填写')}</div>
          </div>
          ${p.note ? `<p class="small" style="margin:10px 0 0;color:#5f5975">📝 ${esc(p.note)}</p>` : ''}
        </div>
      </div>

      <div class="grid cols-4" style="margin-top:4px">
        ${statHTML('📔', d.stats.diary_count, '日记')}
        ${statHTML('💉', d.stats.health_count, '健康记录')}
        ${statHTML('🍚', d.plans.length, '喂食计划')}
        ${statHTML('🖼️', d.stats.photo_count, '照片')}
      </div>

      <div>
        <div class="date-head">体重曲线</div>
        ${lineChart(weights, { height: 200, unit: ' kg' })}
      </div>

      <div class="grid cols-2">
        <div>
          <div class="date-head">待办提醒</div>
          ${upcoming.length ? upcoming.map((r) => {
            const m = dueMeta(r.due_date);
            return `<div class="list-item ${m.cls}"><span class="chip ${m.tone === 'red' ? 'red' : m.tone === 'amber' ? 'amber' : 'gray'}">${esc(m.text)}</span>
              <div class="grow"><div class="title">${esc(r.title)}</div><div class="muted small">${esc(r.type)} · ${esc(r.due_date)}</div></div></div>`;
          }).join('') : '<div class="muted small">没有待办</div>'}
        </div>
        <div>
          <div class="date-head">健康到期</div>
          ${nextHealth.length ? nextHealth.map((h) => {
            const m = dueMeta(h.next_due);
            return `<div class="list-item ${m.cls}"><span class="chip ${m.tone === 'red' ? 'red' : m.tone === 'amber' ? 'amber' : 'gray'}">${esc(h.next_due)}</span>
              <div class="grow"><div class="title">${esc(h.type)} · ${esc(h.name || '')}</div><div class="muted small">上次 ${esc(h.happened_at)}</div></div></div>`;
          }).join('') : '<div class="muted small">没有到期项</div>'}
        </div>
      </div>

      <div>
        <div class="date-head">最近日记</div>
        ${d.diary.length ? `<div class="timeline">${d.diary.slice(0, 8).map((r) => `
          <div class="tl-item ${r.category === '就医' ? 'amber' : 'accent'}">
            <div style="font-weight:700">${esc(r.title || r.category)}</div>
            <div class="muted small">${esc(fmtDate(r.happened_at, true))} · ${esc(r.category)}${r.mood ? ` · ${esc(r.mood)}` : ''}</div>
            ${r.content ? `<div class="small" style="margin-top:2px">${esc(r.content)}</div>` : ''}
            ${r.photos?.length ? `<div class="thumb-strip" style="margin-top:6px" data-photo-group>${r.photos.map((u) => `<div class="thumb" data-photo="${esc(u)}"><img src="${esc(u)}" alt="照片" /></div>`).join('')}</div>` : ''}
          </div>`).join('')}</div>` : '<div class="muted small">还没有日记</div>'}
      </div>
    </div>`,
  });
}

registerPage('pets', {
  title: '宠物档案',
  subtitle: () => (state.pets.length ? `共 ${state.pets.length} 只毛孩子` : '先添加一只毛孩子吧'),
  async render(view) {
    const res = await api.get('/api/pets');
    const pets = res.items;

    view.innerHTML = `
      <div class="spread" style="margin-bottom:14px">
        <div class="muted small">记录每只宠物的品种、生日、体重、芯片与备注信息</div>
        <button class="btn primary" data-action="new">＋ 添加宠物</button>
      </div>
      ${
        pets.length
          ? `<div class="grid auto-260">${pets
              .map(
                (p) => `<div class="card" data-id="${p.id}" style="cursor:pointer">
                  <div class="row" style="flex-wrap:nowrap;align-items:center;gap:14px">
                    ${avatarHTML(p, 'lg')}
                    <div style="min-width:0;flex:1">
                      <div class="spread" style="align-items:flex-start">
                        <div>
                          <h3 style="font-size:17px">${esc(p.name)}</h3>
                          <div class="muted small">${esc(p.breed || p.species)}</div>
                        </div>
                        <span class="chip ${p.status === '在身边' ? 'green' : 'gray'}">${esc(p.status)}</span>
                      </div>
                      <div class="pill-row" style="margin-top:8px">
                        <span class="chip pink">${esc(p.age_text)}</span>
                        <span class="chip blue">${num(p.weight, 2)} kg</span>
                        <span class="chip gray">${esc(p.gender)}</span>
                      </div>
                    </div>
                  </div>
                  <div class="muted small" style="margin-top:10px">🎂 生日 ${esc(p.birthday || '未填写')} · 🏠 到家 ${esc(p.adopt_date || '未填写')}</div>
                  ${p.note ? `<div class="small" style="margin-top:6px;color:#5f5975;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.note)}</div>` : ''}
                  <div class="row" style="margin-top:12px">
                    <button class="btn sm" data-action="detail" data-id="${p.id}">查看档案</button>
                    <button class="btn sm" data-action="edit" data-id="${p.id}">编辑</button>
                    <button class="btn sm ghost" data-action="diary" data-id="${p.id}">记日记</button>
                  </div>
                </div>`
              )
              .join('')}</div>`
          : emptyHTML('还没有宠物档案，点击「添加宠物」开始吧', '🐾')
      }
    `;

    view.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      const card = e.target.closest('[data-id]');
      const action = btn?.dataset.action;
      const id = btn?.dataset.id || card?.dataset.id;
      try {
        if (action === 'new') return petForm(null);
        if (action === 'detail' || (!action && card)) return petDetailModal(Number(id));
        if (action === 'edit') return petForm(pets.find((p) => String(p.id) === String(id)));
        if (action === 'diary') return quickDiaryModal(id);
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  },
});
