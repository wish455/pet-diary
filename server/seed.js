/**
 * 演示数据脚本：
 *   node server/seed.js                     首次运行且数据库为空时写入示例数据
 *   node server/seed.js --reset             清空后重新写入
 *   node server/seed.js --user 账号 --password 密码   指定示例数据归属的账号（默认 demo / demo12345）
 *
 * 说明：示例数据会归属到一个演示账号，登录后即可看到；
 *      也可以不建账号，第一个注册的账号会自动接管这些无归属数据。
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, now, UPLOAD_DIR } from './db.js';
import { createUser, findUserByName, assignAvatar } from './auth.js';

const today = new Date();
const iso = (d) => d.toISOString();
const day = (offset) => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
/** 生成"本地日期 + 指定时分"的 ISO 串（按 UTC 读写，避免时区二次偏移） */
const at = (offsetDays, hh = 9, mm = 0) => {
  const d = new Date(today.getTime() + offsetDays * 86400000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm, 0)).toISOString();
};

/* 生成占位头像（SVG，无需外部图片） */
const AVATARS = {
  'mimi.svg': { bg: '#ffe6ef', emoji: '🐱', label: '咪咪' },
  'doudou.svg': { bg: '#e6f1ff', emoji: '🐶', label: '豆豆' },
  'xueqiu.svg': { bg: '#eafbf1', emoji: '🐰', label: '雪球' },
};

function makeAvatar(file, { bg, emoji, label }) {
  const target = path.join(UPLOAD_DIR, file);
  if (fs.existsSync(target)) return `/uploads/${file}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" rx="48" fill="${bg}"/>
  <text x="160" y="170" font-size="140" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
  <text x="160" y="268" font-size="30" text-anchor="middle" fill="#5b5b6b" font-family="sans-serif">${label}</text>
</svg>`;
  fs.writeFileSync(target, svg, 'utf8');
  return `/uploads/${file}`;
}

const petsData = [
  {
    name: '咪咪',
    species: '猫',
    breed: '中华田园猫（橘白）',
    gender: '母',
    birthday: day(-820),
    adopt_date: day(-780),
    weight: 4.2,
    color: '橘白',
    chip_no: 'CN-9001-2023-0451',
    sterilized: 1,
    status: '在身边',
    avatar: makeAvatar('mimi.svg', AVATARS['mimi.svg']),
    note: '挑食，只吃鸡胸和罐头；怕生人，喜欢纸箱和阳台晒太阳。',
    sort: 1,
  },
  {
    name: '豆豆',
    species: '狗',
    breed: '柯基',
    gender: '公',
    birthday: day(-460),
    adopt_date: day(-420),
    weight: 11.6,
    color: '三色',
    chip_no: 'CN-9002-2024-1188',
    sterilized: 1,
    status: '在身边',
    avatar: makeAvatar('doudou.svg', AVATARS['doudou.svg']),
    note: '精力旺盛，每天两次遛弯；对鸡肉过敏，主粮选鸭肉配方。',
    sort: 2,
  },
  {
    name: '雪球',
    species: '其他',
    breed: '垂耳兔',
    gender: '公',
    birthday: day(-300),
    adopt_date: day(-260),
    weight: 1.8,
    color: '纯白',
    chip_no: '',
    sterilized: 0,
    status: '在身边',
    avatar: makeAvatar('xueqiu.svg', AVATARS['xueqiu.svg']),
    note: '无限量提摩西干草 + 少量兔粮，注意牙齿磨耗。',
    sort: 3,
  },
];

const recipesData = [
  {
    name: '鸡肉南瓜猫饭（熟自制基础版）',
    for_pet: '猫',
    category: '主食',
    ingredients: [
      { name: '鸡胸肉', amount: 500, unit: 'g' },
      { name: '鸡心', amount: 80, unit: 'g' },
      { name: '鸡肝', amount: 50, unit: 'g' },
      { name: '南瓜（熟）', amount: 60, unit: 'g' },
      { name: '蛋黄', amount: 30, unit: 'g' },
      { name: '蛋壳粉', amount: 6, unit: 'g' },
      { name: '牛磺酸粉', amount: 1, unit: 'g' },
      { name: '鱼油', amount: 5, unit: 'g' },
    ],
    steps: '1. 鸡胸、鸡心、鸡肝冷水下锅，煮 12 分钟至全熟，捞出沥干。\n2. 南瓜蒸熟压泥。\n3. 肉类切小块或用料理机打成粗糜，与南瓜泥拌匀。\n4. 蛋壳粉、牛磺酸粉、鱼油拌入，放凉至常温（不超过 40℃）再喂。\n5. 分装成每次一餐的量，冷藏 3 天 / 冷冻 30 天。',
    tips: '熟自制必须补钙：无骨肉配方需按每 100g 肉加 0.8~1g 蛋壳粉。牛磺酸不耐高温，务必关火后添加。',
    batch_weight: 732,
  },
  {
    name: '低温慢煮鸭肉狗饭（低敏配方）',
    for_pet: '狗',
    category: '主食',
    ingredients: [
      { name: '鸭胸肉', amount: 800, unit: 'g' },
      { name: '牛心', amount: 120, unit: 'g' },
      { name: '牛肝', amount: 60, unit: 'g' },
      { name: '胡萝卜（熟）', amount: 100, unit: 'g' },
      { name: '西兰花', amount: 80, unit: 'g' },
      { name: '燕麦（熟）', amount: 100, unit: 'g' },
      { name: '碳酸钙粉', amount: 8, unit: 'g' },
      { name: '鱼油', amount: 8, unit: 'g' },
    ],
    steps: '1. 鸭胸肉切块，70℃ 低温慢煮 40 分钟（或蒸 20 分钟）。\n2. 牛心、牛肝蒸熟切碎，肝脏量不超过总量 5%。\n3. 胡萝卜、西兰花蒸软切碎，燕麦煮熟。\n4. 全部拌匀，加碳酸钙粉与鱼油。\n5. 按体重分装：每 10kg 体重每日约 350~450g（视活动量调整）。',
    tips: '鸡肉过敏犬可用鸭肉/火鸡肉替代。换粮需 7 天过渡，混旧粮比例 2:8 → 5:5 → 8:2。',
    batch_weight: 1276,
  },
  {
    name: '沙丁鱼补钙小鱼冻（猫狗通用加餐）',
    for_pet: '猫狗通用',
    category: '加餐',
    ingredients: [
      { name: '沙丁鱼（连骨）', amount: 300, unit: 'g' },
      { name: '鸡蛋（全蛋）', amount: 100, unit: 'g' },
      { name: '南瓜（熟）', amount: 50, unit: 'g' },
    ],
    steps: '1. 沙丁鱼去头去内脏，连骨蒸熟。\n2. 鸡蛋打散蒸成蛋羹。\n3. 与南瓜泥一同打碎，倒入冰格冷冻成小块。\n4. 每次取 1~2 块解冻喂食，每周不超过 3 次。',
    tips: '连骨沙丁鱼天然补钙、富含 Omega-3，适合作为拌粮加餐，不建议长期超过每日热量 10%。',
    batch_weight: 450,
  },
  {
    name: '肠胃不适期的南瓜鸡肉粥',
    for_pet: '猫狗通用',
    category: '汤饮',
    ingredients: [
      { name: '鸡胸肉', amount: 200, unit: 'g' },
      { name: '南瓜（熟）', amount: 150, unit: 'g' },
      { name: '白米饭（熟）', amount: 100, unit: 'g' },
    ],
    steps: '1. 鸡胸肉煮烂撕丝，鸡汤留用。\n2. 南瓜蒸熟压泥，米饭煮软。\n3. 三者加鸡汤调成糊状，温热喂食，少量多次。',
    tips: '呕吐/腹泻恢复期短期使用（3~5 天），之后需逐步换回营养完整的主食，否则会缺钙缺牛磺酸。',
    batch_weight: 450,
  },
];

function seed({ reset = false } = {}) {
  const existing = db.prepare('SELECT COUNT(*) c FROM pets').get().c;
  if (existing > 0 && !reset) {
    console.log(`数据库已有 ${existing} 只宠物，跳过写入示例数据。如需重置：npm run reset`);
    return;
  }
  if (reset) {
    for (const t of ['feeding_log', 'feeding_plan', 'weight_log', 'health', 'diary', 'reminder', 'recipe', 'pets']) {
      db.exec(`DELETE FROM ${t}`);
    }
    console.log('已清空原有数据。');
  }

  const insertPet = db.prepare(
    `INSERT INTO pets(name, species, breed, gender, birthday, adopt_date, weight, color, chip_no, sterilized, status, avatar, note, sort, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const petIds = {};
  for (const p of petsData) {
    const info = insertPet.run(p.name, p.species, p.breed, p.gender, p.birthday, p.adopt_date, p.weight, p.color, p.chip_no, p.sterilized, p.status, p.avatar, p.note, p.sort, now(), now());
    petIds[p.name] = Number(info.lastInsertRowid);
  }
  const mimi = petIds['咪咪'];
  const doudou = petIds['豆豆'];
  const xueqiu = petIds['雪球'];

  // 体重曲线
  const insertWeight = db.prepare('INSERT INTO weight_log(pet_id, date, weight, note, created_at) VALUES(?,?,?,?,?)');
  const weightSeries = [
    [mimi, [4.05, 4.1, 4.15, 4.2, 4.18, 4.2, 4.22, 4.2]],
    [doudou, [10.8, 11.0, 11.3, 11.4, 11.5, 11.6, 11.6, 11.6]],
    [xueqiu, [1.6, 1.68, 1.72, 1.75, 1.78, 1.8, 1.8, 1.8]],
  ];
  for (const [petId, series] of weightSeries) {
    series.forEach((w, i) => {
      insertWeight.run(petId, day(-7 * (series.length - 1 - i) - 1), w, i === series.length - 1 ? '本月测量' : '', now());
    });
  }

  // 健康记录
  const insertHealth = db.prepare(
    `INSERT INTO health(pet_id, type, name, happened_at, next_due, hospital, doctor, cost, weight, result, note, created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  insertHealth.run(mimi, '疫苗', '猫三联加强', day(-330), day(35), '安心动物医院', '王医生', 180, 4.1, '抗体良好', '每年一次加强', now());
  insertHealth.run(mimi, '驱虫', '体内外同驱（大宠爱）', day(-58), day(2), '安心动物医院', '王医生', 120, 4.2, '无异常', '每月一次', now());
  insertHealth.run(mimi, '就诊', '轻度牙龈炎', day(-120), '', '安心动物医院', '李医生', 350, 4.15, '牙龈轻度红肿，建议漱口水护理', '两周后复查，已恢复', now());
  insertHealth.run(mimi, '体检', '年度体检', day(-330), day(35), '安心动物医院', '王医生', 680, 4.1, '血常规、生化、心超均正常', '建议每年一次', now());

  insertHealth.run(doudou, '疫苗', '狂犬疫苗', day(-300), day(65), '汪汪宠物医院', '陈医生', 150, 11.2, '接种顺利', '需每年加强', now());
  insertHealth.run(doudou, '驱虫', '体外驱虫（福来恩）', day(-27), day(3), '汪汪宠物医院', '陈医生', 130, 11.6, '无跳蚤蜱虫', '每月一次', now());
  insertHealth.run(doudou, '就诊', '右后腿轻微跛行', day(-75), '', '汪汪宠物医院', '陈医生', 420, 11.4, '软组织拉伤，休息两周', '已恢复跑跳', now());

  insertHealth.run(xueqiu, '就诊', '牙齿检查', day(-60), day(-5), '小宠专科', '赵医生', 200, 1.8, '臼齿轻微过长', '需增加干草摄入并复查', now());

  // 喂食计划
  const insertPlan = db.prepare(
    `INSERT INTO feeding_plan(pet_id, time_of_day, food_name, food_type, amount, unit, days, active, note, created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`
  );
  insertPlan.run(mimi, '07:30', '主食罐头（鸡肉味）', '罐头', 85, 'g', '1,2,3,4,5,6,7', 1, '分两次喂，加温水拌开', now());
  insertPlan.run(mimi, '19:00', '鸡肉南瓜猫饭', '自制', 90, 'g', '1,2,3,4,5,6,7', 1, '自制主食，按配方分装', now());
  insertPlan.run(mimi, '22:30', '冻干零食', '零食', 5, 'g', '1,3,5,7', 1, '训练奖励用', now());
  insertPlan.run(doudou, '07:00', '鸭肉配方主粮', '主粮', 130, 'g', '1,2,3,4,5,6,7', 1, '分早晚两次，控量防肥胖', now());
  insertPlan.run(doudou, '18:30', '低温慢煮鸭肉狗饭', '自制', 150, 'g', '1,2,3,4,5,6,7', 1, '', now());
  insertPlan.run(doudou, '21:00', '关节保健品', '保健品', 2, '粒', '1,2,3,4,5,6,7', 1, '随餐喂', now());
  insertPlan.run(xueqiu, '08:00', '成年兔粮', '主粮', 25, 'g', '1,2,3,4,5,6,7', 1, '干草无限量供应', now());

  // 喂食记录（今天 + 昨天）
  const insertFeedLog = db.prepare(
    `INSERT INTO feeding_log(pet_id, plan_id, date, time_of_day, food_name, amount, unit, finished, note, created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`
  );
  const plans = db.prepare('SELECT * FROM feeding_plan').all();
  for (const plan of plans) {
    if (plan.time_of_day < '19:00') {
      insertFeedLog.run(plan.pet_id, plan.id, day(0), plan.time_of_day, plan.food_name, plan.amount, plan.unit, 1, '', now());
    }
    insertFeedLog.run(plan.pet_id, plan.id, day(-1), plan.time_of_day, plan.food_name, plan.amount, plan.unit, plan.food_name === '冻干零食' ? 0 : 1, '', now());
  }

  // 日记
  const insertDiary = db.prepare(
    `INSERT INTO diary(pet_id, happened_at, category, mood, title, content, photos, created_at) VALUES(?,?,?,?,?,?,?,?)`
  );
  insertDiary.run(mimi, at(0, 7, 40), '喂食', '开心', '早餐吃得干干净净', '换了新的鸡肉罐头，咪咪一口气吃完，还舔了碗三遍。', '[]', now());
  insertDiary.run(mimi, at(0, 12, 20), '便便', '平常', '便便成型', '颜色偏深，形状正常，没有软便。', '[]', now());
  insertDiary.run(mimi, at(-1, 21, 10), '玩耍', '兴奋', '纸箱争夺战', '新买的猫抓板纸箱成了它的新家，钻进钻出玩了半小时。', '[]', now());
  insertDiary.run(mimi, at(-3, 15, 0), '洗澡', '不适', '第一次洗澡有点应激', '全程叫，吹干后躲在床底两小时才出来。下次改用免洗泡沫。', '[]', now());
  insertDiary.run(doudou, at(0, 7, 20), '遛弯', '兴奋', '晨间遛弯 40 分钟', '公园遇到三只小伙伴，跑得很欢，回家喝了半碗水。', '[]', now());
  insertDiary.run(doudou, at(0, 19, 10), '喂食', '开心', '晚餐光盘', '低温慢煮的鸭肉饭全吃完了，没有挑食。', '[]', now());
  insertDiary.run(doudou, at(-2, 16, 30), '训练', '开心', '学会了「趴下」', '用冻干做奖励，10 分钟就学会了趴下，连续成功率 8/10。', '[]', now());
  insertDiary.run(doudou, at(-5, 10, 0), '就医', '平常', '年度疫苗接种', '接种狂犬疫苗，医生检查牙齿有轻微牙结石，建议刷牙。', '[]', now());
  insertDiary.run(xueqiu, at(-1, 9, 30), '喂食', '平常', '兔粮减量', '按医生建议减少兔粮，增加提摩西干草，胃口不错。', '[]', now());
  insertDiary.run(xueqiu, at(-6, 11, 0), '就医', '不适', '牙齿复查', '臼齿轻微过长，需要多啃干草磨牙。', '[]', now());

  // 食谱
  const insertRecipe = db.prepare(
    `INSERT INTO recipe(name, for_pet, category, ingredients, steps, tips, cover, batch_weight, is_public, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const r of recipesData) {
    insertRecipe.run(r.name, r.for_pet, r.category, JSON.stringify(r.ingredients), r.steps, r.tips, '', r.batch_weight, 1, now(), now());
  }

  // 提醒
  const insertReminder = db.prepare(
    `INSERT INTO reminder(pet_id, title, type, due_date, repeat_days, done, done_at, note, created_at) VALUES(?,?,?,?,?,?,?,?,?)`
  );
  insertReminder.run(mimi, '体内外驱虫（每月）', '驱虫', day(2), 30, 0, '', '大宠爱滴剂，注意滴在后颈皮肤', now());
  insertReminder.run(mimi, '猫三联加强针', '疫苗', day(35), 365, 0, '', '提前一周预约医院', now());
  insertReminder.run(doudou, '体外驱虫', '驱虫', day(3), 30, 0, '', '', now());
  insertReminder.run(doudou, '每周刷牙 3 次', '其他', day(0), 3, 0, '', '用宠物专用牙膏', now());
  insertReminder.run(doudou, '狂犬疫苗加强', '疫苗', day(65), 365, 0, '', '', now());
  insertReminder.run(doudou, '洗澡', '洗澡', day(-1), 21, 0, '', '昨天该洗澡了', now());
  insertReminder.run(xueqiu, '牙齿复查', '复诊', day(-5), 0, 0, '', '已过期，尽快预约小宠专科', now());
  insertReminder.run(mimi, '剪指甲', '剪指甲', day(6), 21, 0, '', '', now());

  // 归属到演示账号（未指定则留空，由首个注册账号自动接管）
  const username = argValue('--user') || 'demo';
  const password = argValue('--password') || 'demo12345';
  let owner = findUserByName(username);
  if (!owner) {
    owner = createUser({ username, password, nickname: '演示账号', role: 'admin' });
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(assignAvatar(owner.id, '演示账号'), owner.id);
    console.log(`已创建演示账号：${username} / ${password}（请在首次登录后修改密码）`);
  } else {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(owner.id);
    console.log(`复用已有账号：${username}（已确保为管理员）`);
  }
  const tables = ['pets', 'diary', 'health', 'weight_log', 'feeding_plan', 'feeding_log', 'recipe', 'reminder'];
  let adopted = 0;
  for (const t of tables) adopted += Number(db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`).run(owner.id).changes || 0);
  console.log(`示例数据已归属账号「${owner.username}」，共归属 ${adopted} 条记录。`);
  console.log('示例数据写入完成：3 只宠物、10 条日记、8 条健康记录、7 条喂食计划、4 个食谱、8 条提醒。');
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : '';
}

seed({ reset: process.argv.includes('--reset') });
