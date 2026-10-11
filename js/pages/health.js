/** 健康管理：体重曲线、疫苗/驱虫/就诊记录、到期提醒联动 */
import {
  api, esc, num, fmtDate, fmtRelative, emptyHTML, dueMeta, speciesEmoji, statHTML,
  openModal, closeModal, confirmDialog, toast, inputField, selectField, textareaField, $, el, todayStr,
} from '../ui.js';
import { lineChart } from '../charts.js';
import { registerPage, state, refresh } from '../app.js';

const HEALTH_TYPES = ['疫苗', '驱虫', '就诊', '用药', '体检', '手术', '其他'];
const TYPE_ICON = { 疫苗: '💉', 驱虫: '🪱', 就诊: '🏥', 用药: '💊', 体检: '🩺', 手术: '🔧', 其他: '📋' };
const TYPE_TONE = { 疫苗: 'blue', 驱虫: 'amber', 就诊: 'pink', 用药: 'green', 体检: 'gray', 手术: 'red', 其他: 'gray' };
const DUE_PRESETS = [
  { label: '不设置', months: 0 },
  { label: '1 个月后', months: 1 },
  { label: '3 个月后', months: 3 },
  { label: '6 个月后', months: 6 },
  { label: '12 个月后', months: 12 },
];

function addMonths(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function healthForm(record, presetType = '疫苗') {
  const isEdit = !!record;
  const type = record?.type || presetType;
  const petOptions = state.pets.map((p) => ({ value: p.id, label: `${speciesEmoji(p.species)} ${p.name}` }));
  const today = todayStr();
  openModal({
    title: isEdit ? '编辑健康记录' : `新增${type}记录`,
    submitText: '保存',
    wide: true,
    body: `<div class="form-grid">
      ${selectField('宠物', 'pet_id', petOptions, { value: record?.pet_id ?? (state.petId !== 'all' ? state.petId : petOptions[0]?.value) })}
      ${selectField('类型', 'type', HEALTH_TYPES, { value: type })}
      ${inputField('项目名称', 'name', { value: record?.name || '', placeholder: '例如：猫三联加强 / 大宠爱 / 年度体检', span: true })}
      ${inputField('日期', 'happened_at', { type: 'date', value: record?.happened_at?.slice(0, 10) || today, required: true })}
      ${selectField(
        '下次到期',
        'due_preset',
        [{ value: '', label: '自定义 / 不设置' }, ...DUE_PRESETS.slice(1).map((p) => ({ value: p.months, label: p.label }))],
        { value: '' }
      )}
      ${inputField('到期日期（可手填）', 'next_due', { type: 'date', value: record?.next_due || '' })}
      ${inputField('医院 / 机构', 'hospital', { value: record?.hospital || '', placeholder: '例如：安心动物医院' })}
      ${inputField('医生', 'doctor', { value: record?.doctor || '' })}
      ${inputField('体重（kg，选填）', 'weight', { type: 'number', step: '0.01', value: record?.weight ?? '' })}
      ${inputField('花费（元）', 'cost', { type: 'number', step: '0.01', value: record?.cost ?? '' })}
      ${textareaField('结论 / 诊断', 'result', { value: record?.result || '', placeholder: '医生结论、化验结果、用药方案…', rows: 3 })}
      ${textareaField('备注', 'note', { value: record?.note || '', placeholder: '下次注意事项、是否需复查…', rows: 3 })}
    </div>`,
    onSubmit: async (data) => {
      const nextDue = data.next_due || (data.due_preset ? addMonths(data.happened_at, Number(data.due_preset)) : '');
      const payload = {
        pet_id: Number(data.pet_id),
        type: data.type,
        name: data.name,
        happened_at: data.happened_at,
        next_due: nextDue,
        hospital: data.hospital,
        doctor: data.doctor,
        weight: data.weight === '' ? null : Number(data.weight),
        cost: data.cost === '' ? 0 : Number(data.cost),
        result: data.result,
        note: data.note,
      };
      if (isEdit) await api.put(`/api/health/${record.id}`, payload);
      else await api.post('/api/health', payload);

      // 到期自动生成提醒
      if (nextDue && (!isEdit || record.next_due !== nextDue)) {
        await api.post('/api/reminders', {
          pet_id: payload.pet_id,
          title: `${payload.type}·${payload.name || '未命名'} 到期`,
          type: payload.type,
          due_date: nextDue,
          repeat_days: 0,
          note: `由健康记录自动生成（${payload.happened_at} 记录）`,
        });
      }
      closeModal();
      toast(isEdit ? '健康记录已更新' : '健康记录已保存', 'ok');
      await refresh();
    },
    onMount: (form) => {
      const typeSel = $('select[name=type]', form);
      const presetSel = $('select[name=due_preset]', form);
      const dueInput = $('input[name=next_due]', form);
      const dateInput = $('input[name=happened_at]', form);
      typeSel.addEventListener('change', () => {
        const map = { 疫苗: 12, 驱虫: 1, 体检: 12, 就诊: 0, 用药: 0, 手术: 0, 其他: 0 };
        const m = map[typeSel.value] || 0;
        presetSel.value = m ? String(m) : '';
        if (m) dueInput.value = addMonths(dateInput.value, m);
      });
      presetSel.addEventListener('change', () => {
        if (presetSel.value) dueInput.value = addMonths(dateInput.value, Number(presetSel.value));
      });
      if (isEdit) {
        const del = el('<button type="button" class="btn danger">删除</button>');
        del.addEventListener('click', async () => {
          if (!(await confirmDialog('删除这条健康记录？', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/health/${record.id}`);
          toast('已删除', 'ok');
          await refresh();
        });
        $('.modal-foot', form).prepend(del);
      }
    },
  });
}

export function weightForm(log) {
  const isEdit = !!log;
  const petOptions = state.pets.map((p) => ({ value: p.id, label: `${speciesEmoji(p.species)} ${p.name}` }));
  openModal({
    title: isEdit ? '编辑体重记录' : '记录体重',
    submitText: '保存',
    body: `<div class="form-grid">
      ${selectField('宠物', 'pet_id', petOptions, { value: log?.pet_id ?? (state.petId !== 'all' ? state.petId : petOptions[0]?.value) })}
      ${inputField('日期', 'date', { type: 'date', value: log?.date || todayStr(), required: true })}
      ${inputField('体重（kg）', 'weight', { type: 'number', step: '0.01', value: log?.weight ?? '', required: true, placeholder: '4.20' })}
      ${inputField('备注', 'note', { value: log?.note || '', placeholder: '饭前 / 洗澡后 / 有点挑食…' })}
    </div>`,
    onSubmit: async (data) => {
      const payload = { pet_id: Number(data.pet_id), date: data.date, weight: Number(data.weight), note: data.note };
      if (payload.weight <= 0) throw new Error('体重必须大于 0');
      if (isEdit) await api.put(`/api/weights/${log.id}`, payload);
      else await api.post('/api/weights', payload);
      closeModal();
      toast('体重已记录', 'ok');
      await refresh();
    },
    onMount: (form) => {
      if (isEdit) {
        const del = el('<button type="button" class="btn danger">删除</button>');
        del.addEventListener('click', async () => {
          if (!(await confirmDialog('删除这条体重记录？', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/weights/${log.id}`);
          toast('已删除', 'ok');
          await refresh();
        });
        $('.modal-foot', form).prepend(del);
      }
    },
  });
}

registerPage('health', {
  title: '健康管理',
  subtitle: () => '体重曲线、疫苗驱虫、就诊用药一站式记录',
  async render(view) {
    const tab = state.filters.healthTab || 'weight';
    state.filters.healthTab = tab;
    const petQ = state.petId !== 'all' ? `&pet_id=${state.petId}` : '';
    const [weights, health] = await Promise.all([
      api.get(`/api/weights?limit=800${petQ}`),
      api.get(`/api/health?limit=500${petQ}`),
    ]);

    const petName = new Map(state.pets.map((p) => [p.id, p]));
    const weightByPet = new Map();
    for (const w of weights.items) {
      if (!weightByPet.has(w.pet_id)) weightByPet.set(w.pet_id, []);
      weightByPet.get(w.pet_id).push(w);
    }

    const vaccines = health.items.filter((h) => h.type === '疫苗' || h.type === '驱虫');
    const visits = health.items.filter((h) => !['疫苗', '驱虫'].includes(h.type));
    const dueSoon = health.items.filter((h) => h.next_due && h.next_due <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    const totalCost = health.items.reduce((s, h) => s + (Number(h.cost) || 0), 0);

    const weightChart = () => {
      const parts = [];
      for (const [petId, list] of weightByPet) {
        const pet = petName.get(petId);
        if (!pet) continue;
        const sorted = [...list].sort((a, b) => (a.date > b.date ? 1 : -1));
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const delta = first && last ? Number(last.weight) - Number(first.weight) : 0;
        parts.push(`
          <div class="card" style="margin-bottom:14px">
            <div class="card-head">
              <h3>${speciesEmoji(pet.species)} ${esc(pet.name)} 的体重曲线</h3>
              <div class="right">
                <span class="chip ${delta > 0 ? 'amber' : delta < 0 ? 'green' : 'gray'}">${delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} ${num(Math.abs(delta), 2)} kg</span>
                <span class="chip blue">当前 ${num(last?.weight, 2)} kg</span>
                <button class="btn sm" data-action="add-weight" data-pet="${petId}">＋ 记录体重</button>
              </div>
            </div>
            ${lineChart(sorted.map((w) => ({ label: w.date, value: w.weight })), { unit: ' kg', height: 220 })}
            <div class="table-wrap" style="margin-top:10px">
              <table>
                <thead><tr><th>日期</th><th>体重</th><th>备注</th><th></th></tr></thead>
                <tbody>${[...sorted].reverse().slice(0, 6).map((w) => `
                  <tr><td>${esc(w.date)}</td><td><strong>${num(w.weight, 2)} kg</strong></td><td class="muted small">${esc(w.note || '—')}</td>
                  <td class="row tight"><button class="btn sm ghost" data-action="edit-weight" data-id="${w.id}">编辑</button></td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>`);
      }
      return parts.join('') || emptyHTML('还没有体重记录，点「记录体重」开始追踪吧', '⚖️');
    };

    const recordList = (list, emptyText) =>
      list.length
        ? `<div class="grid auto-260">${list
            .map((h) => {
              const meta = dueMeta(h.next_due);
              const pet = petName.get(h.pet_id);
              return `<div class="card tight">
                <div class="spread" style="align-items:flex-start">
                  <span class="chip ${TYPE_TONE[h.type] || 'gray'}">${TYPE_ICON[h.type] || '📋'} ${esc(h.type)}</span>
                  <span class="muted small mono">${esc(h.happened_at)}</span>
                </div>
                <h4 style="margin:9px 0 4px;font-size:15px">${esc(h.name || '未命名')}</h4>
                <div class="row tight" style="margin-bottom:6px">
                  ${pet ? `<span class="chip gray">${speciesEmoji(pet.species)} ${esc(pet.name)}</span>` : ''}
                  ${h.weight ? `<span class="chip blue">${num(h.weight, 2)} kg</span>` : ''}
                  ${h.cost ? `<span class="chip amber">¥${num(h.cost, 0)}</span>` : ''}
                  ${h.next_due ? `<span class="chip ${meta.tone === 'red' ? 'red' : meta.tone === 'amber' ? 'amber' : 'gray'}">下次 ${esc(h.next_due)} · ${esc(meta.text)}</span>` : ''}
                </div>
                ${h.result ? `<div class="small muted" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(h.result)}</div>` : ''}
                <div class="muted small" style="margin-top:6px">${esc([h.hospital, h.doctor].filter(Boolean).join(' · ') || '—')}</div>
                <div class="row tight" style="margin-top:10px">
                  <button class="btn sm ghost" data-action="edit-health" data-id="${h.id}">编辑</button>
                  <button class="btn sm ghost" data-action="del-health" data-id="${h.id}">删除</button>
                </div>
              </div>`;
            })
            .join('')}</div>`
        : emptyHTML(emptyText, '🩺');

    view.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px">
        ${statHTML('⚖️', weights.total, '体重记录')}
        ${statHTML('💉', vaccines.length, '疫苗/驱虫')}
        ${statHTML('🏥', visits.length, '就诊/体检')}
        ${statHTML('💰', `¥${num(totalCost, 0)}`, '累计花费')}
      </div>
      ${dueSoon.length ? `<div class="card tight" style="margin-bottom:16px;border-color:#ffe0c2;background:linear-gradient(90deg,var(--amber-soft),#fff 45%)">
        <div class="spread"><strong>⚠️ 30 天内有 ${dueSoon.length} 项需要处理</strong><a class="btn sm ghost" href="#/reminders">去提醒页 ›</a></div>
        <div class="pill-row" style="margin-top:8px">${dueSoon.map((h) => `<span class="chip ${dueMeta(h.next_due).tone === 'red' ? 'red' : 'amber'}">${esc(petName.get(h.pet_id)?.name || '')} ${esc(h.type)} · ${esc(h.next_due)}</span>`).join('')}</div>
      </div>` : ''}

      <div class="tabs">
        <button class="tab ${tab === 'weight' ? 'active' : ''}" data-tab="weight">⚖️ 体重曲线</button>
        <button class="tab ${tab === 'vaccine' ? 'active' : ''}" data-tab="vaccine">💉 疫苗与驱虫</button>
        <button class="tab ${tab === 'visit' ? 'active' : ''}" data-tab="visit">🏥 就诊与用药</button>
      </div>

      <div class="spread" style="margin-bottom:12px">
        <div class="muted small">${tab === 'weight' ? '建议每周固定时间（饭前、同一体重秤）测量，曲线更有参考价值' : '到期日会自动同步到「提醒待办」'}</div>
        <div class="row">
          ${tab === 'weight' ? '<button class="btn primary" data-action="add-weight">＋ 记录体重</button>' : ''}
          ${tab === 'vaccine' ? '<button class="btn primary" data-action="add-vaccine">＋ 疫苗/驱虫</button>' : ''}
          ${tab === 'visit' ? '<button class="btn primary" data-action="add-visit">＋ 就诊/体检</button>' : ''}
        </div>
      </div>

      <div id="healthBody">
        ${tab === 'weight' ? weightChart() : tab === 'vaccine' ? recordList(vaccines, '还没有疫苗或驱虫记录') : recordList(visits, '还没有就诊记录')}
      </div>
    `;

    view.addEventListener('click', async (e) => {
      const tabBtn = e.target.closest('.tab');
      if (tabBtn) {
        state.filters.healthTab = tabBtn.dataset.tab;
        return refresh();
      }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, pet } = btn.dataset;
      try {
        if (action === 'add-weight') {
          const preset = pet ? { pet_id: Number(pet) } : null;
          if (preset) state.petId = String(preset.pet_id);
          return weightForm(null);
        }
        if (action === 'edit-weight') return weightForm(weights.items.find((w) => String(w.id) === String(id)));
        if (action === 'add-vaccine') return healthForm(null, '疫苗');
        if (action === 'add-visit') return healthForm(null, '就诊');
        if (action === 'edit-health') return healthForm(health.items.find((h) => String(h.id) === String(id)));
        if (action === 'del-health') {
          if (!(await confirmDialog('删除这条健康记录？', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/health/${id}`);
          toast('已删除', 'ok');
          return refresh();
        }
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  },
});
