/**
 * 宠物营养计算：食材营养库 + 熟自制配方分析
 * 数据为通用参考值（每 100g 可食部），用于家庭自制配餐的粗略估算，不能替代兽医营养师处方。
 */

export const INGREDIENTS = [
  { name: '鸡胸肉', group: '肉类', kcal: 133, protein: 24.6, fat: 2.5, ca: 5, p: 210, taurine: 30 },
  { name: '鸡腿肉（去皮）', group: '肉类', kcal: 146, protein: 20, fat: 7.2, ca: 8, p: 196, taurine: 28 },
  { name: '鸡心', group: '内脏', kcal: 153, protein: 15.5, fat: 9.5, ca: 11, p: 178, taurine: 120 },
  { name: '鸡肝', group: '内脏', kcal: 121, protein: 16.6, fat: 4.8, ca: 8, p: 297, taurine: 60 },
  { name: '鸡胗', group: '肉类', kcal: 118, protein: 19.2, fat: 2.8, ca: 7, p: 135, taurine: 40 },
  { name: '鸭胸肉', group: '肉类', kcal: 138, protein: 15, fat: 8.5, ca: 6, p: 150, taurine: 25 },
  { name: '牛肉（瘦）', group: '肉类', kcal: 143, protein: 20.5, fat: 6.2, ca: 6, p: 172, taurine: 40 },
  { name: '牛心', group: '内脏', kcal: 132, protein: 17.5, fat: 6.5, ca: 8, p: 200, taurine: 100 },
  { name: '牛肝', group: '内脏', kcal: 135, protein: 20.4, fat: 3.6, ca: 6, p: 345, taurine: 55 },
  { name: '猪里脊', group: '肉类', kcal: 155, protein: 20.2, fat: 7.9, ca: 6, p: 190, taurine: 30 },
  { name: '三文鱼', group: '水产', kcal: 208, protein: 20, fat: 13, ca: 9, p: 240, taurine: 70 },
  { name: '巴沙鱼/鳕鱼', group: '水产', kcal: 88, protein: 18, fat: 1.2, ca: 12, p: 200, taurine: 60 },
  { name: '沙丁鱼（连骨）', group: '水产', kcal: 208, protein: 24.6, fat: 11.5, ca: 382, p: 490, taurine: 90 },
  { name: '鹌鹑', group: '肉类', kcal: 134, protein: 20, fat: 5, ca: 12, p: 200, taurine: 60 },
  { name: '鸡蛋（全蛋）', group: '其他', kcal: 143, protein: 12.6, fat: 9.5, ca: 56, p: 198, taurine: 50 },
  { name: '蛋黄', group: '其他', kcal: 322, protein: 15.9, fat: 28.2, ca: 129, p: 390, taurine: 60 },
  { name: '南瓜（熟）', group: '蔬果', kcal: 26, protein: 1, fat: 0.1, ca: 21, p: 44, taurine: 0 },
  { name: '胡萝卜（熟）', group: '蔬果', kcal: 35, protein: 0.8, fat: 0.2, ca: 33, p: 35, taurine: 0 },
  { name: '西兰花', group: '蔬果', kcal: 34, protein: 2.8, fat: 0.4, ca: 47, p: 66, taurine: 0 },
  { name: '菠菜', group: '蔬果', kcal: 23, protein: 2.9, fat: 0.4, ca: 99, p: 49, taurine: 0 },
  { name: '红薯（熟）', group: '蔬果', kcal: 90, protein: 2, fat: 0.2, ca: 30, p: 47, taurine: 0 },
  { name: '蓝莓', group: '蔬果', kcal: 57, protein: 0.7, fat: 0.3, ca: 6, p: 12, taurine: 0 },
  { name: '白米饭（熟）', group: '碳水', kcal: 116, protein: 2.6, fat: 0.3, ca: 10, p: 43, taurine: 0 },
  { name: '燕麦（熟）', group: '碳水', kcal: 71, protein: 2.5, fat: 1.5, ca: 9, p: 77, taurine: 0 },
  { name: '蛋壳粉', group: '补充剂', kcal: 0, protein: 0, fat: 0, ca: 38000, p: 100, taurine: 0 },
  { name: '碳酸钙粉', group: '补充剂', kcal: 0, protein: 0, fat: 0, ca: 40000, p: 0, taurine: 0 },
  { name: '牛磺酸粉', group: '补充剂', kcal: 0, protein: 0, fat: 0, ca: 0, p: 0, taurine: 100000 },
  { name: '鱼油', group: '补充剂', kcal: 902, protein: 0, fat: 100, ca: 0, p: 0, taurine: 0 },
  { name: '鸡脂/动物油', group: '补充剂', kcal: 900, protein: 0, fat: 100, ca: 0, p: 0, taurine: 0 },
];

/** 每日静息能量需求 RER = 70 × 体重(kg)^0.75 */
export function rer(weightKg) {
  if (!weightKg || weightKg <= 0) return 0;
  return 70 * Math.pow(weightKg, 0.75);
}

/** 不同生理阶段的每日能量系数（DER = RER × 系数） */
export const LIFE_STAGES = [
  { key: 'adult_neutered', label: '成犬/成猫·已绝育', factor: 1.6, cat: 1.2 },
  { key: 'adult_intact', label: '成犬/成猫·未绝育', factor: 1.8, cat: 1.4 },
  { key: 'weight_loss', label: '减重期', factor: 1.0, cat: 0.8 },
  { key: 'puppy', label: '幼年·生长期', factor: 3.0, cat: 2.5 },
  { key: 'senior', label: '老年·活动量低', factor: 1.2, cat: 1.1 },
  { key: 'active', label: '高活动量/工作犬', factor: 2.5, cat: 1.8 },
  { key: 'gestation', label: '妊娠/哺乳期', factor: 3.0, cat: 2.5 },
];

export function dailyEnergy(weightKg, species, stageKey) {
  const stage = LIFE_STAGES.find((s) => s.key === stageKey) || LIFE_STAGES[0];
  const factor = species === '猫' ? stage.cat : stage.factor;
  const base = rer(weightKg);
  return { rer: base, factor, der: base * factor };
}

export function ingredientByName(name) {
  return INGREDIENTS.find((i) => i.name === name) || null;
}

/**
 * 计算配方营养。
 * @param {Array<{name:string, amount:number, unit:string}>} items
 */
export function analyzeRecipe(items = []) {
  let totalWeight = 0;
  let kcal = 0;
  let protein = 0;
  let fat = 0;
  let ca = 0;
  let p = 0;
  let taurine = 0;
  const unknown = [];
  const rows = [];

  for (const item of items) {
    const info = ingredientByName(item.name);
    const amount = Number(item.amount) || 0;
    if (!info) {
      unknown.push(item.name);
      continue;
    }
    const ratio = amount / 100;
    const row = {
      name: item.name,
      group: info.group,
      amount,
      unit: item.unit || 'g',
      kcal: info.kcal * ratio,
      protein: info.protein * ratio,
      fat: info.fat * ratio,
      ca: info.ca * ratio,
      p: info.p * ratio,
      taurine: info.taurine * ratio,
    };
    rows.push(row);
    totalWeight += amount;
    kcal += row.kcal;
    protein += row.protein;
    fat += row.fat;
    ca += row.ca;
    p += row.p;
    taurine += row.taurine;
  }

  const per100 = (v) => (totalWeight > 0 ? (v / totalWeight) * 100 : 0);
  const energyFromProtein = protein * 4;
  const energyFromFat = fat * 9;
  const energySum = energyFromProtein + energyFromFat;

  const meatWeight = rows.filter((r) => r.group === '肉类' || r.group === '水产').reduce((s, r) => s + r.amount, 0);
  const organWeight = rows.filter((r) => r.group === '内脏').reduce((s, r) => s + r.amount, 0);
  const boneCa = ca;
  const caP = p > 0 ? ca / p : 0;

  const warnings = [];
  if (unknown.length) warnings.push(`未收录的食材：${unknown.join('、')}（未计入营养）`);
  if (totalWeight > 0) {
    if (organWeight / totalWeight < 0.05) warnings.push('内脏（尤其肝脏）偏少：建议占总量 5%~10%，提供维生素 A 与铜等');
    if (organWeight / totalWeight > 0.15) warnings.push('内脏偏多：长期超过 15% 有维生素 A 中毒风险');
    if (meatWeight / totalWeight < 0.55) warnings.push('动物性蛋白偏少：猫狗主食建议肉类（含心）占 60%~80%');
    if (caP > 0 && caP < 1.1) warnings.push(`钙磷比 ${caP.toFixed(2)}:1 偏低（理想 1.1~1.3:1），可补充蛋壳粉或碳酸钙粉`);
    if (caP > 1.6) warnings.push(`钙磷比 ${caP.toFixed(2)}:1 偏高，注意不要过量补钙`);
    if (fat / Math.max(totalWeight, 1) * 100 < 5) warnings.push('脂肪偏低：可加少量鸡脂或鱼油，帮助脂溶性维生素吸收');
  }
  if (energySum > 0) {
    const pRatio = energyFromProtein / energySum;
    const fRatio = energyFromFat / energySum;
    if (pRatio < 0.4) warnings.push(`蛋白质供能占比 ${(pRatio * 100).toFixed(0)}%（建议 ≥45%），可增加瘦肉比例`);
    if (fRatio > 0.5) warnings.push(`脂肪供能占比 ${(fRatio * 100).toFixed(0)}%（建议 ≤40%），注意控制油脂`);
  }

  return {
    rows,
    totalWeight,
    total: { kcal, protein, fat, ca, p, taurine },
    per100: {
      kcal: per100(kcal),
      protein: per100(protein),
      fat: per100(fat),
      ca: per100(ca),
      p: per100(p),
      taurine: per100(taurine),
    },
    caP,
    ratios: {
      meat: totalWeight ? meatWeight / totalWeight : 0,
      organ: totalWeight ? organWeight / totalWeight : 0,
    },
    energySplit: {
      protein: energySum ? energyFromProtein / energySum : 0,
      fat: energySum ? energyFromFat / energySum : 0,
    },
    warnings,
  };
}

/** 依据体重/阶段算出该配方每天该喂多少克 */
export function feedingSuggestion({ weightKg, species = '猫', stageKey, recipePer100Kcal }) {
  const energy = dailyEnergy(weightKg, species, stageKey);
  const der = energy.der;
  const gramsPerDay = recipePer100Kcal > 0 ? (der / recipePer100Kcal) * 100 : 0;
  return {
    ...energy,
    gramsPerDay,
    gramsPerMeal: gramsPerDay / 2,
    monthlyKg: (gramsPerDay * 30) / 1000,
  };
}
