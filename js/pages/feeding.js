/** 喂食计划：今日喂食打卡、计划管理、喂食记录 */
import {
  api, esc, num, fmtDate, weekdayName, emptyHTML, speciesEmoji, statHTML, todayStr,
  openModal, closeModal, confirmDialog, toast, inputField, selectField, textareaField, $, el, chipsHTML, checkboxField,
} from '../ui.js';
import { registerPage, state, refresh } from '../app.js';

const FOOD_TYPES = ['主粮', '罐头', '冻干', '生骨肉', '自制', '零食', '保健品'];
const TYPE_ICON = { 主粮: '🥣', 罐头: '🥫', 冻干: '🍖', 生骨肉: '🥩', 自制: '🍲', 零食: '🦴', 保健品: '💊' };
const WEEK = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
];

export function planForm(plan) {
  const isEdit = !!plan;
  const petOptions = state.pets.map((p) => ({ value: p.id, label: `${speciesEmoji(p.species)} ${p.name}` }));
  const activeDays = String(plan?.days || '1,2,3,4,5,6,7').split(',').map((s) => Number(s.trim()));
  openModal({
    title: isEdit ? '编辑喂食计划' : '新增喂食计划',
    submitText: '保存',
    body: `<div class="form-grid">
      ${selectField('宠物', 'pet_id', petOptions, { value: plan?.pet_id ?? (state.petId !== 'all' ? state.petId : petOptions[0]?.value) })}
      ${inputField('时间', 'time_of_day', { type: 'time', value: plan?.time_of_day || '08:00' })}
      ${inputField('食物名称', 'food_name', { value: plan?.food_name || '', required: true, placeholder: '例如：鸭肉配方主粮', span: true })}
      ${selectField('类型', 'food_type', FOOD_TYPES, { value: plan?.food_type || '主粮' })}
      ${inputField('份量', 'amount', { type: 'number', step: '0.1', value: plan?.amount ?? 100 })}
      ${selectField('单位', 'unit', ['g', 'ml', '粒', '勺', '块', '片'], { value: plan?.unit || 'g' })}
      <div class="field span-2">
        <label>重复（周几喂）</label>
        <div class="pill-row">${WEEK.map(
          (w) => `<label class="chip clickable ${activeDays.includes(w.value) ? 'active' : ''}" style="cursor:pointer">
            <input type="checkbox" name="day_${w.value}" ${activeDays.includes(w.value) ? 'checked' : ''} hidden /> 周${w.label}</label>`
        ).join('')}</div>
      </div>
      ${textareaField('备注', 'note', { value: plan?.note || '', placeholder: '拌水、分两次喂、随餐喂保健品…', rows: 2 })}
      ${checkboxField('启用该计划', 'active', plan ? !!plan.active : true)}
    </div>`,
    onSubmit: async (data) => {
      const days = WEEK.filter((w) => data[`day_${w.value}`]).map((w) => w.value);
      if (!days.length) throw new Error('请至少选择一个喂食日');
      const payload = {
        pet_id: Number(data.pet_id),
        time_of_day: data.time_of_day,
        food_name: data.food_name,
        food_type: data.food_type,
        amount: Number(data.amount) || 0,
        unit: data.unit,
        days: days.join(','),
        note: data.note,
        active: data.active ? 1 : 0,
      };
      if (isEdit) await api.put(`/api/feeding-plans/${plan.id}`, payload);
      else await api.post('/api/feeding-plans', payload);
      closeModal();
      toast(isEdit ? '计划已更新' : '计划已创建', 'ok');
      await refresh();
    },
    onMount: (form) => {
      form.querySelectorAll('.chip.clickable input[type=checkbox]').forEach((cb) => {
        cb.addEventListener('change', () => cb.closest('.chip').classList.toggle('active', cb.checked));
      });
      if (isEdit) {
        const del = el('<button type="button" class="btn danger">删除</button>');
        del.addEventListener('click', async () => {
          if (!(await confirmDialog('删除这条喂食计划？已产生的喂食记录会保留。', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/feeding-plans/${plan.id}`);
          toast('已删除', 'ok');
          await refresh();
        });
        $('.modal-foot', form).prepend(del);
      }
    },
  });
}

function logForm(log) {
  const isEdit = !!log;
  const petOptions = state.pets.map((p) => ({ value: p.id, label: `${speciesEmoji(p.species)} ${p.name}` }));
  openModal({
    title: isEdit ? '编辑喂食记录' : '补录喂食',
    submitText: '保存',
    body: `<div class="form-grid">
      ${selectField('宠物', 'pet_id', petOptions, { value: log?.pet_id ?? (state.petId !== 'all' ? state.petId : petOptions[0]?.value) })}
      ${inputField('日期', 'date', { type: 'date', value: log?.date || todayStr() })}
      ${inputField('时间', 'time_of_day', { type: 'time', value: log?.time_of_day || '08:00' })}
      ${inputField('食物名称', 'food_name', { value: log?.food_name || '', placeholder: '例如：主食罐头' })}
      ${inputField('份量', 'amount', { type: 'number', step: '0.1', value: log?.amount ?? 100 })}
      ${selectField('单位', 'unit', ['g', 'ml', '粒', '勺', '块', '片'], { value: log?.unit || 'g' })}
      ${checkboxField('吃完了', 'finished', log ? !!log.finished : true)}
      ${inputField('备注', 'note', { value: log?.note || '', placeholder: '剩了一点 / 挑食…', span: true })}
    </div>`,
    onSubmit: async (data) => {
      const payload = {
        pet_id: Number(data.pet_id),
        date: data.date,
        time_of_day: data.time_of_day,
        food_name: data.food_name,
        amount: Number(data.amount) || 0,
        unit: data.unit,
        finished: data.finished ? 1 : 0,
        note: data.note,
      };
      if (isEdit) await api.put(`/api/feeding-logs/${log.id}`, payload);
      else await api.post('/api/feeding-logs', payload);
      closeModal();
      toast('已保存', 'ok');
      await refresh();
    },
    onMount: (form) => {
      if (isEdit) {
        const del = el('<button type="button" class="btn danger">删除</button>');
        del.addEventListener('click', async () => {
          if (!(await confirmDialog('删除这条喂食记录？', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/feeding-logs/${log.id}`);
          toast('已删除', 'ok');
          await refresh();
        });
        $('.modal-foot', form).prepend(del);
      }
    },
  });
}

registerPage('feeding', {
  title: '喂食计划',
  subtitle: () => '定时定量打卡，掌握每天的进食情况',
  async render(view) {
    const tab = state.filters.feedTab || 'today';
    state.filters.feedTab = tab;
    const date = state.filters.feedDate || todayStr();
    state.filters.feedDate = date;

    const petQ = state.petId !== 'all' ? `&pet_id=${state.petId}` : '';
    const [today, plans, logs] = await Promise.all([
      api.get(`/api/feeding/today?date=${date}`),
      api.get(`/api/feeding-plans?limit=300${petQ}`),
      api.get(`/api/feeding-logs?limit=200&date=${date}${petQ}`),
    ]);
    const petName = new Map(state.pets.map((p) => [p.id, p]));
    const filteredSchedule = state.petId === 'all' ? today.schedule : today.schedule.filter((s) => String(s.plan.pet_id) === String(state.petId));
    const doneCount = filteredSchedule.filter((s) => s.log).length;
    const totalPlan = filteredSchedule.reduce((s, x) => s + Number(x.plan.amount || 0), 0);
    const totalDone = filteredSchedule.filter((s) => s.log).reduce((s, x) => s + Number(x.plan.amount || 0), 0);

    const shiftDate = (n) => {
      const d = new Date(`${date}T00:00:00`);
      d.setDate(d.getDate() + n);
      state.filters.feedDate = d.toISOString().slice(0, 10);
      refresh();
    };

    view.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px">
        ${statHTML('🍚', `${doneCount}/${filteredSchedule.length}`, '今日完成度')}
        ${statHTML('⚖️', `${num(totalDone)}/${num(totalPlan)}`, '已喂 / 计划份量')}
        ${statHTML('📋', plans.total, '喂食计划')}
        ${statHTML('📝', logs.total, '当日喂食记录')}
      </div>

      <div class="tabs">
        <button class="tab ${tab === 'today' ? 'active' : ''}" data-tab="today">📅 今日喂食</button>
        <button class="tab ${tab === 'plans' ? 'active' : ''}" data-tab="plans">📋 计划管理</button>
        <button class="tab ${tab === 'logs' ? 'active' : ''}" data-tab="logs">📝 喂食记录</button>
      </div>

      ${
        tab === 'today'
          ? `
        <div class="spread" style="margin-bottom:12px">
          <div class="row">
            <button class="btn sm" data-action="prev-day">‹ 前一天</button>
            <strong>${esc(date)} ${esc(weekdayName(date))}${date === todayStr() ? ' · 今天' : ''}</strong>
            <button class="btn sm" data-action="next-day">后一天 ›</button>
            <button class="btn sm ghost" data-action="today">回到今天</button>
          </div>
          <button class="btn sm ghost" data-action="add-log">＋ 补录喂食</button>
        </div>
        <div class="grid auto-260">
          ${
            filteredSchedule.length
              ? filteredSchedule
                  .map(({ plan, pet, log }) => {
                    const meta = petName.get(plan.pet_id);
                    return `<div class="card tight" style="${log ? 'border-color:#c9f0e0;background:linear-gradient(160deg,#f2fdf8,#fff 60%)' : ''}">
                      <div class="spread">
                        <span class="chip ${log ? 'green' : 'gray'}">${log ? '✓ 已喂' : '待喂'} · ${esc(plan.time_of_day)}</span>
                        <span class="chip ${log ? 'blue' : 'gray'}">${TYPE_ICON[plan.food_type] || '🥣'} ${esc(plan.food_type)}</span>
                      </div>
                      <h4 style="margin:9px 0 4px;font-size:15px">${esc(plan.food_name)}</h4>
                      <div class="row tight">
                        ${meta ? `<span class="chip gray">${speciesEmoji(meta.species)} ${esc(meta.name)}</span>` : ''}
                        <span class="chip pink">${num(plan.amount)}${esc(plan.unit)}</span>
                        ${plan.note ? `<span class="chip gray">${esc(plan.note)}</span>` : ''}
                      </div>
                      <div class="row" style="margin-top:11px">
                        <button class="btn sm ${log ? '' : 'primary'}" data-action="toggle" data-id="${plan.id}">${log ? '撤销打卡' : '完成打卡'}</button>
                        <button class="btn sm ghost" data-action="edit-plan" data-id="${plan.id}">编辑</button>
                      </div>
                    </div>`;
                  })
                  .join('')
              : emptyHTML('这天没有喂食计划，去「计划管理」添加吧', '🥣')
          }
        </div>`
          : ''
      }

      ${
        tab === 'plans'
          ? `
        <div class="spread" style="margin-bottom:12px">
          <div class="muted small">计划按周重复，可在「今日喂食」一键打卡</div>
          <button class="btn primary" data-action="add-plan">＋ 新增计划</button>
        </div>
        <div class="table-wrap card" style="padding:0">
          <table>
            <thead><tr><th>时间</th><th>宠物</th><th>食物</th><th>类型</th><th>份量</th><th>重复</th><th>状态</th><th></th></tr></thead>
            <tbody>
              ${
                plans.items.length
                  ? [...plans.items]
                      .sort((a, b) => (a.time_of_day > b.time_of_day ? 1 : -1))
                      .map(
                        (p) => `<tr>
                    <td class="mono">${esc(p.time_of_day)}</td>
                    <td>${esc(petName.get(p.pet_id)?.name || '—')}</td>
                    <td><strong>${esc(p.food_name)}</strong>${p.note ? `<div class="muted small">${esc(p.note)}</div>` : ''}</td>
                    <td><span class="chip gray">${TYPE_ICON[p.food_type] || ''} ${esc(p.food_type)}</span></td>
                    <td class="mono">${num(p.amount)}${esc(p.unit)}</td>
                    <td class="small">${String(p.days).split(',').map((d) => `周${WEEK.find((w) => w.value === Number(d))?.label || d}`).join(' ')}</td>
                    <td><span class="chip ${p.active ? 'green' : 'gray'}">${p.active ? '启用' : '停用'}</span></td>
                    <td class="row tight">
                      <button class="btn sm ghost" data-action="edit-plan" data-id="${p.id}">编辑</button>
                      <button class="btn sm ghost" data-action="del-plan" data-id="${p.id}">删除</button>
                    </td>
                  </tr>`
                      )
                      .join('')
                  : `<tr><td colspan="8">${emptyHTML('还没有喂食计划')}</td></tr>`
              }
            </tbody>
          </table>
        </div>`
          : ''
      }

      ${
        tab === 'logs'
          ? `
        <div class="spread" style="margin-bottom:12px">
          <div class="row">
            <button class="btn sm" data-action="prev-day">‹</button>
            <strong>${esc(date)}</strong>
            <button class="btn sm" data-action="next-day">›</button>
          </div>
          <button class="btn primary" data-action="add-log">＋ 补录喂食</button>
        </div>
        <div class="list">
          ${
            logs.items.length
              ? logs.items
                  .map(
                    (l) => `<div class="list-item">
                <span class="chip ${l.finished ? 'green' : 'amber'}">${l.finished ? '✓ 吃完' : '未吃完'}</span>
                <div class="grow">
                  <div class="title">${esc(l.food_name || '喂食')} <span class="chip gray">${esc(petName.get(l.pet_id)?.name || '')}</span></div>
                  <div class="muted small">${esc(l.date)} ${esc(l.time_of_day || '')} · ${num(l.amount)}${esc(l.unit)}${l.note ? ` · ${esc(l.note)}` : ''}</div>
                </div>
                <button class="btn sm ghost" data-action="edit-log" data-id="${l.id}">编辑</button>
              </div>`
                  )
                  .join('')
              : emptyHTML('这天还没有喂食记录', '📝')
          }
        </div>`
          : ''
      }
    `;

    view.addEventListener('click', async (e) => {
      const tabBtn = e.target.closest('.tab');
      if (tabBtn) {
        state.filters.feedTab = tabBtn.dataset.tab;
        return refresh();
      }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      try {
        if (action === 'prev-day') return shiftDate(-1);
        if (action === 'next-day') return shiftDate(1);
        if (action === 'today') {
          state.filters.feedDate = todayStr();
          return refresh();
        }
        if (action === 'toggle') {
          await api.post('/api/feeding/complete', { plan_id: Number(id), date });
          return refresh();
        }
        if (action === 'add-plan') return planForm(null);
        if (action === 'edit-plan') return planForm(plans.items.find((p) => String(p.id) === String(id)));
        if (action === 'del-plan') {
          if (!(await confirmDialog('删除这条喂食计划？', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/feeding-plans/${id}`);
          toast('已删除', 'ok');
          return refresh();
        }
        if (action === 'add-log') return logForm(null);
        if (action === 'edit-log') return logForm(logs.items.find((l) => String(l.id) === String(id)));
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  },
});
