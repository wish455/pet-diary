/** 猫饭狗饭自制食谱：配方库、营养分析、按体重算喂食量 */
import {
  api, esc, num, emptyHTML, speciesEmoji, openModal, closeModal, confirmDialog, toast,
  inputField, selectField, textareaField, photoUploader, $, $$, el, chipsHTML,
} from '../ui.js';
import { registerPage, state, refresh } from '../app.js';

const FOR_PETS = ['猫', '狗', '猫狗通用'];
const CATEGORIES = ['主食', '加餐', '零食', '汤饮', '营养补充'];
const CAT_ICON = { 主食: '🍲', 加餐: '🍗', 零食: '🦴', 汤饮: '🥣', 营养补充: '💊' };

/* ----------------------------- 配方表单 ----------------------------- */

function ingredientRow(item = {}) {
  const row = el(`<div class="row" style="align-items:flex-end;gap:8px;flex-wrap:nowrap">
    <div class="field" style="flex:2">
      <label class="small">食材</label>
      <input class="input" name="ing_name" list="ingList" value="${esc(item.name || '')}" placeholder="选择或输入食材" />
    </div>
    <div class="field" style="flex:1">
      <label class="small">重量(g)</label>
      <input class="input" name="ing_amount" type="number" step="0.1" value="${item.amount ?? ''}" placeholder="100" />
    </div>
    <button type="button" class="btn sm danger" style="margin-bottom:2px">✕</button>
  </div>`);
  $('button', row).addEventListener('click', () => row.remove());
  return row;
}

export function recipeForm(recipe) {
  const isEdit = !!recipe;
  const cover = photoUploader(recipe?.cover ? [recipe.cover] : [], { multiple: false });
  const node = openModal({
    title: isEdit ? '编辑食谱' : '新建食谱',
    submitText: '保存食谱',
    wide: true,
    body: `<datalist id="ingList">${(state.meta?.ingredients || []).map((i) => `<option value="${esc(i.name)}">${esc(i.group)} · ${i.kcal}kcal/100g</option>`).join('')}</datalist>
    <div class="form-grid">
      ${inputField('食谱名称', 'name', { value: recipe?.name || '', required: true, placeholder: '例如：鸡肉南瓜猫饭', span: true })}
      ${selectField('适用', 'for_pet', FOR_PETS, { value: recipe?.for_pet || '猫' })}
      ${selectField('分类', 'category', CATEGORIES, { value: recipe?.category || '主食' })}
      <div class="field span-2">
        <label>食材与用量</label>
        <div class="stack sm" id="ingRows"></div>
        <button type="button" class="btn sm" id="addIng" style="margin-top:8px">＋ 添加食材</button>
      </div>
      ${textareaField('制作步骤', 'steps', { value: recipe?.steps || '', placeholder: '1. 鸡胸肉冷水下锅煮 12 分钟…', rows: 5 })}
      ${textareaField('小贴士', 'tips', { value: recipe?.tips || '', placeholder: '补钙量、保存方式、换粮过渡…', rows: 3 })}
    </div>`,
    onSubmit: async (data, form) => {
      const rows = $$('#ingRows > .row', form);
      const ingredients = rows
        .map((r) => ({
          name: $('input[name=ing_name]', r).value.trim(),
          amount: Number($('input[name=ing_amount]', r).value) || 0,
          unit: 'g',
        }))
        .filter((i) => i.name && i.amount > 0);
      if (!ingredients.length) throw new Error('至少添加一种食材并填写重量');
      const payload = {
        name: data.name,
        for_pet: data.for_pet,
        category: data.category,
        ingredients,
        steps: data.steps,
        tips: data.tips,
        cover: cover.get()[0] || '',
        batch_weight: ingredients.reduce((s, i) => s + i.amount, 0),
      };
      if (isEdit) await api.put(`/api/recipes/${recipe.id}`, payload);
      else await api.post('/api/recipes', payload);
      closeModal();
      toast(isEdit ? '食谱已更新' : '食谱已保存', 'ok');
      await refresh();
    },
    onMount: (form) => {
      const rows = $('#ingRows', form);
      const initial = recipe?.ingredients?.length ? recipe.ingredients : [{}, {}, {}];
      initial.forEach((i) => rows.appendChild(ingredientRow(i)));
      $('#addIng', form).addEventListener('click', () => rows.appendChild(ingredientRow()));
      const wrap = el('<div></div>');
      wrap.appendChild(cover.node);
      $('.form-grid', form).appendChild(wrap);
      if (isEdit) {
        const del = el('<button type="button" class="btn danger">删除食谱</button>');
        del.addEventListener('click', async () => {
          if (!(await confirmDialog('删除这个食谱？', { danger: true, submitText: '删除' }))) return;
          await api.del(`/api/recipes/${recipe.id}`);
          toast('已删除', 'ok');
          await refresh();
        });
        $('.modal-foot', form).prepend(del);
      }
    },
  });
  return node;
}

/* --------------------------- 营养分析视图 --------------------------- */

function analysisHTML(a, suggestion, opts = {}) {
  const t = a.per100;
  return `
    <div class="nutri-grid" style="margin-bottom:12px">
      <div class="nutri-cell"><div class="v">${num(t.kcal, 0)}</div><div class="k">kcal / 100g</div></div>
      <div class="nutri-cell"><div class="v">${num(t.protein, 1)}%</div><div class="k">蛋白质</div></div>
      <div class="nutri-cell"><div class="v">${num(t.fat, 1)}%</div><div class="k">脂肪</div></div>
      <div class="nutri-cell"><div class="v" style="color:${a.caP >= 1.1 && a.caP <= 1.4 ? '#15916c' : '#d33b4d'}">${a.caP ? `${num(a.caP, 2)}:1` : '—'}</div><div class="k">钙磷比</div></div>
      <div class="nutri-cell"><div class="v">${num(a.ratios.meat * 100, 0)}%</div><div class="k">肉类占比</div></div>
      <div class="nutri-cell"><div class="v">${num(a.ratios.organ * 100, 0)}%</div><div class="k">内脏占比</div></div>
    </div>
    <div class="small muted" style="margin-bottom:10px">
      整批 ${num(a.totalWeight, 0)}g · 总热量 ${num(a.total.kcal, 0)} kcal · 蛋白 ${num(a.total.protein, 1)}g · 脂肪 ${num(a.total.fat, 1)}g · 钙 ${num(a.total.ca, 0)}mg · 磷 ${num(a.total.p, 0)}mg
      ${a.per100.taurine > 0 ? ` · 牛磺酸 ${num(a.total.taurine, 0)}mg` : ''}
    </div>
    ${
      suggestion
        ? `<div class="card tight" style="background:var(--accent-soft);border-color:#e3ddff;margin-bottom:12px">
            <strong>🐾 按 ${num(opts.weightKg, 2)}kg ${esc(opts.species || '猫')} 估算</strong>
            <div class="row tight" style="margin-top:6px">
              <span class="chip blue">静息 RER ${num(suggestion.rer, 0)} kcal</span>
              <span class="chip pink">日需约 ${num(suggestion.der, 0)} kcal（系数 ${num(suggestion.factor, 1)}）</span>
              <span class="chip green">每天约 ${num(suggestion.gramsPerDay, 0)} g</span>
              <span class="chip amber">每餐约 ${num(suggestion.gramsPerMeal, 0)} g（2 餐）</span>
              <span class="chip gray">每月约 ${num(suggestion.monthlyKg, 1)} kg 成品</span>
            </div>
          </div>`
        : ''
    }
    ${
      a.warnings.length
        ? `<details style="margin-bottom:10px" ${a.warnings.length <= 2 ? 'open' : ''}>
            <summary style="cursor:pointer;font-weight:700;color:#b57517">⚠️ 配方提示（${a.warnings.length}）</summary>
            <ul class="warn-list" style="margin-top:8px">${a.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
          </details>`
        : `<div class="chip green" style="margin-bottom:10px">✓ 主要营养比例看起来合理（仅供参考，长期自制建议咨询兽医营养师）</div>`
    }
    <div class="table-wrap">
      <table>
        <thead><tr><th>食材</th><th>用量</th><th>热量</th><th>蛋白</th><th>脂肪</th><th>钙</th><th>磷</th></tr></thead>
        <tbody>${a.rows
          .map(
            (r) => `<tr><td>${esc(r.name)}</td><td class="mono">${num(r.amount)} g</td><td class="mono">${num(r.kcal, 0)}</td>
          <td class="mono">${num(r.protein, 1)}</td><td class="mono">${num(r.fat, 1)}</td>
          <td class="mono">${num(r.ca, 0)}</td><td class="mono">${num(r.p, 0)}</td></tr>`
          )
          .join('')}</tbody>
      </table>
    </div>`;
}

async function recipeDetail(id) {
  const recipe = (await api.get(`/api/recipes/${id}`));
  const stageOptions = (state.meta?.stages || []).map((s) => ({ value: s.key, label: `${s.label}（×${recipe.for_pet === '猫' ? s.cat : s.factor}）` }));
  const petOptions = [{ value: '', label: '自定义体重' }, ...state.pets.map((p) => ({ value: p.id, label: `${speciesEmoji(p.species)} ${p.name}（${num(p.weight, 2)}kg）` }))];

  const node = openModal({
    title: recipe.name,
    wide: true,
    body: `<div class="stack">
      <div class="row tight">
        <span class="chip pink">${esc(recipe.for_pet)}</span>
        <span class="chip gray">${CAT_ICON[recipe.category] || ''} ${esc(recipe.category)}</span>
        <span class="chip blue">成品 ${num(recipe.batch_weight, 0)} g</span>
      </div>
      ${recipe.cover ? `<img src="${esc(recipe.cover)}" alt="食谱封面" style="width:100%;max-height:240px;object-fit:cover;border-radius:14px" />` : ''}
      <div class="grid cols-2" style="gap:16px">
        <div>
          <div class="date-head">食材清单</div>
          ${recipe.ingredients.map((i) => `<div class="recipe-ing"><span>${esc(i.name)}</span><span class="mono">${num(i.amount)} ${esc(i.unit || 'g')}</span></div>`).join('')}
        </div>
        <div>
          <div class="date-head">制作步骤</div>
          <div class="pre small">${esc(recipe.steps || '暂无步骤说明')}</div>
          ${recipe.tips ? `<div class="card tight" style="margin-top:12px;background:var(--amber-soft);border-color:#ffe3c2">
            <strong class="small">💡 小贴士</strong><div class="small" style="margin-top:4px">${esc(recipe.tips)}</div></div>` : ''}
        </div>
      </div>

      <div>
        <div class="date-head">营养分析与喂食量计算</div>
        <div class="card tight">
          <div class="row" style="margin-bottom:12px">
            <div class="field" style="min-width:190px"><label class="small">按宠物计算</label><select class="input" id="calcPet">${petOptions.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></div>
            <div class="field" style="width:120px"><label class="small">体重(kg)</label><input class="input" id="calcWeight" type="number" step="0.1" value="${num(state.pets[0]?.weight || 4, 2)}" /></div>
            <div class="field" style="width:120px"><label class="small">物种</label><select class="input" id="calcSpecies">${['猫', '狗'].map((s) => `<option ${recipe.for_pet === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
            <div class="field" style="flex:1;min-width:180px"><label class="small">生理阶段</label><select class="input" id="calcStage">${stageOptions.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></div>
          </div>
          <div id="analysisBox"></div>
        </div>
      </div>
    </div>`,
    onMount: (form, modal) => {
      const box = modal.querySelector('#analysisBox');
      const run = async () => {
        const weightKg = Number(modal.querySelector('#calcWeight').value) || 0;
        const species = modal.querySelector('#calcSpecies').value;
        const stageKey = modal.querySelector('#calcStage').value;
        const res = await api.post('/api/recipes/analyze', { recipe_id: recipe.id, weightKg, species, stageKey });
        box.innerHTML = analysisHTML(res.analysis, res.suggestion, { weightKg, species });
      };
      modal.querySelector('#calcPet').addEventListener('change', (e) => {
        const pet = state.pets.find((p) => String(p.id) === e.target.value);
        if (pet) {
          modal.querySelector('#calcWeight').value = num(pet.weight || 0, 2);
          modal.querySelector('#calcSpecies').value = pet.species === '狗' ? '狗' : '猫';
        }
        run();
      });
      ['#calcWeight', '#calcSpecies', '#calcStage'].forEach((sel) => modal.querySelector(sel).addEventListener('change', run));
      run();
    },
  });
  return node;
}

/* ----------------------------- 计算器 ----------------------------- */

function calculatorModal() {
  const petOptions = [{ value: '', label: '选择宠物自动带入' }, ...state.pets.map((p) => ({ value: p.id, label: `${speciesEmoji(p.species)} ${p.name}` }))];
  openModal({
    title: '喂食量计算器',
    submitText: '计算',
    wide: true,
    body: `<div class="form-grid">
      ${selectField('宠物', 'pet_id', petOptions, { value: state.petId !== 'all' ? state.petId : '' })}
      ${selectField('物种', 'species', ['猫', '狗'], { value: '猫' })}
      ${inputField('体重（kg）', 'weight', { type: 'number', step: '0.1', value: num(state.pets[0]?.weight || 4, 2) })}
      ${selectField('生理阶段', 'stageKey', (state.meta?.stages || []).map((s) => ({ value: s.key, label: s.label })), { value: 'adult_neutered' })}
      ${inputField('食物热量（kcal / 100g）', 'kcal100', { type: 'number', step: '1', value: 150, span: true })}
    </div>
    <div id="calcOut" style="margin-top:14px"></div>`,
    onSubmit: async (data) => {
      const out = document.querySelector('#calcOut');
      const weightKg = Number(data.weight);
      const kcal100 = Number(data.kcal100);
      if (!weightKg || !kcal100) throw new Error('请填写体重与热量');
      const res = await api.post('/api/recipes/analyze', {
        ingredients: [{ name: '鸡胸肉', amount: 100, unit: 'g' }],
        weightKg,
        species: data.species,
        stageKey: data.stageKey,
      });
      const s = res.suggestion;
      const grams = (s.der / kcal100) * 100;
      out.innerHTML = `<div class="card tight" style="background:var(--accent-soft);border-color:#e3ddff">
        <div class="nutri-grid">
          <div class="nutri-cell"><div class="v">${num(s.rer, 0)}</div><div class="k">RER kcal</div></div>
          <div class="nutri-cell"><div class="v">${num(s.factor, 1)}×</div><div class="k">阶段系数</div></div>
          <div class="nutri-cell"><div class="v">${num(s.der, 0)}</div><div class="k">每日所需 kcal</div></div>
          <div class="nutri-cell"><div class="v" style="color:#15916c">${num(grams, 0)} g</div><div class="k">每天喂食量</div></div>
          <div class="nutri-cell"><div class="v">${num(grams / 2, 0)} g</div><div class="k">每餐（2 餐）</div></div>
          <div class="nutri-cell"><div class="v">${num((grams * 30) / 1000, 1)} kg</div><div class="k">每月用量</div></div>
        </div>
        <p class="muted small" style="margin:10px 0 0">公式：RER = 70 × 体重(kg)<sup>0.75</sup>，DER = RER × 阶段系数。幼年、妊娠、减重等阶段差异很大，请结合体况评分调整。</p>
      </div>`;
      return false;
    },
    onMount: (form) => {
      form.querySelector('select[name=pet_id]').addEventListener('change', (e) => {
        const pet = state.pets.find((p) => String(p.id) === e.target.value);
        if (!pet) return;
        form.querySelector('input[name=weight]').value = num(pet.weight || 0, 2);
        form.querySelector('select[name=species]').value = pet.species === '狗' ? '狗' : '猫';
      });
    },
  });
}

/* ------------------------------- 页面 ------------------------------- */

registerPage('recipes', {
  title: '猫饭狗饭',
  subtitle: () => '自制食谱库 + 营养分析与喂食量计算',
  async render(view) {
    const f = state.filters.recipes || (state.filters.recipes = { forPet: '', category: '', q: '' });
    const params = new URLSearchParams();
    if (f.forPet) params.set('for_pet', f.forPet);
    if (f.category) params.set('category', f.category);
    if (f.q) params.set('q', f.q);
    const res = await api.get(`/api/recipes?${params}`);
    const recipes = res.items;

    view.innerHTML = `
      <div class="card tight" style="margin-bottom:14px">
        <div class="spread" style="flex-wrap:wrap;gap:10px">
          <div class="stack sm" style="gap:8px">
            ${chipsHTML([{ value: '', label: '全部适用' }, ...FOR_PETS.map((p) => ({ value: p, label: p }))], { active: f.forPet, action: 'forPet', name: 'forPet' })}
            ${chipsHTML([{ value: '', label: '全部分类' }, ...CATEGORIES.map((c) => ({ value: c, label: `${CAT_ICON[c]} ${c}` }))], { active: f.category, action: 'category', name: 'category' })}
          </div>
          <div class="row">
            <input class="input" id="recipeSearch" placeholder="搜索食谱或食材…" value="${esc(f.q)}" style="width:190px" />
            <button class="btn" data-action="calc">🧮 喂食量计算器</button>
            <button class="btn primary" data-action="new">＋ 新建食谱</button>
          </div>
        </div>
      </div>

      <div class="card tight" style="margin-bottom:14px;background:linear-gradient(120deg,#fff6ea,#fff 55%)">
        <strong>🍳 熟自制核心原则</strong>
        <div class="small muted" style="margin-top:4px">
          肉类（含心）60%~80% · 内脏 5%~10%（其中肝脏约一半）· 骨骼或钙粉补足钙磷比 1.1~1.3:1 · 猫必须额外补牛磺酸（关火后加）· 熟自制不建议长期全自制而缺乏维生素与微量元素，可搭配商业主食或营养预混粉。
        </div>
      </div>

      ${
        recipes.length
          ? `<div class="grid auto-260">${recipes
              .map(
                (r) => `<div class="card" data-id="${r.id}" style="cursor:pointer;padding:0;overflow:hidden">
                  <div style="height:120px;background:linear-gradient(135deg,#ffeef5,#efedff);display:grid;place-items:center;font-size:44px">
                    ${r.cover ? `<img src="${esc(r.cover)}" alt="${esc(r.name)}" style="width:100%;height:100%;object-fit:cover" />` : CAT_ICON[r.category] || '🍲'}
                  </div>
                  <div style="padding:14px">
                    <div class="row tight" style="margin-bottom:6px">
                      <span class="chip pink">${esc(r.for_pet)}</span>
                      <span class="chip gray">${CAT_ICON[r.category] || ''} ${esc(r.category)}</span>
                    </div>
                    <h4 style="font-size:15px">${esc(r.name)}</h4>
                    <div class="muted small" style="margin-top:6px">
                      ${r.ingredients.length} 种食材 · 成品 ${num(r.batch_weight, 0)}g
                    </div>
                    <div class="row" style="margin-top:11px">
                      <button class="btn sm" data-action="detail" data-id="${r.id}">查看配方</button>
                      <button class="btn sm ghost" data-action="edit" data-id="${r.id}">编辑</button>
                    </div>
                  </div>
                </div>`
              )
              .join('')}</div>`
          : emptyHTML('还没有食谱，点「新建食谱」把你家的拿手猫饭记下来吧', '🍲')
      }
    `;

    const search = $('#recipeSearch', view);
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.filters.recipes.q = search.value.trim();
        refresh();
      }, 350);
    });

    view.addEventListener('click', async (e) => {
      const chip = e.target.closest('.chip.clickable');
      if (chip) {
        state.filters.recipes[chip.dataset.name] = chip.dataset.value;
        return refresh();
      }
      const btn = e.target.closest('[data-action]');
      const card = e.target.closest('[data-id]');
      const action = btn?.dataset.action;
      const id = btn?.dataset.id || card?.dataset.id;
      try {
        if (action === 'new') return recipeForm(null);
        if (!action && card) {
          const r = recipes.find((x) => String(x.id) === String(id));
          return recipeForm(r);
        }
        if (action === 'calc') return calculatorModal();
        if (action === 'detail') return recipeDetail(Number(id));
        if (action === 'edit') return recipeForm(recipes.find((x) => String(x.id) === String(id)));
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  },
});
