/**
 * 界面截图脚本：node tests/screenshots.mjs [--keep]
 * 会用一个独立的临时数据目录（.tmp-shots/）启动服务并写入演示数据，
 * 然后用无头 Chrome 截图到 tests/out/，不会影响 data/ 里的真实数据。
 *
 * 环境变量：CHROME 指定浏览器路径，PORT 指定端口（默认 3900）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PORT) || 3900;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP_DATA = path.join(ROOT, '.tmp-shots');
const OUT = path.join(ROOT, 'tests', 'out');
const PROFILE = path.join(ROOT, '.chrome-profile');
const SHOT_TOKEN = crypto.randomBytes(12).toString('hex');

fs.rmSync(TMP_DATA, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const env = {
  ...process.env,
  PORT: String(PORT),
  HOST: '127.0.0.1',
  DATA_DIR: TMP_DATA,
  NODE_ENV: 'development',
  COOKIE_SECURE: '0',
  SHOT_TOKEN,
};
const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return true;
    } catch {}
    await sleep(250);
  }
  throw new Error('服务启动超时');
}

function shot(name, url, { width = 1440, height = 1400, budget = 7000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(
      CHROME,
      [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter',
        '--force-device-scale-factor=1', `--user-data-dir=${PROFILE}`,
        '--hide-scrollbars', `--window-size=${width},${height}`,
        `--screenshot=${path.join(OUT, `${name}.png`)}`,
        `--virtual-time-budget=${budget}`,
        url,
      ],
      { stdio: 'ignore' }
    );
    child.on('exit', () => resolve(name));
    setTimeout(() => child.kill(), 30000);
  });
}

async function api(pathname, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + pathname, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const json = await res.json().catch(() => null);
  return { status: res.status, json, cookie: setCookie };
}

try {
  await waitForServer();
  console.log(`服务已启动：${BASE}（数据目录 ${TMP_DATA}）`);

  /* 1) 未登录：登录 / 注册页 */
  await shot('ui-01-login', `${BASE}/#/dashboard`, { height: 950 });
  console.log('  ✓ ui-01-login.png（未登录时的登录页）');

  /* 2) 建账号并写入演示数据（直接调用接口，模拟真实使用） */
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: { username: 'shotuser', password: 'shotpass12345', nickname: '截图账号' },
  });
  if (reg.status !== 200) throw new Error(`注册失败：${JSON.stringify(reg.json)}`);
  let cookie = reg.cookie;
  console.log(`  注册成功，角色=${reg.json.data.user.role}`);

  const pets = [
    { name: '咪咪', species: '猫', breed: '中华田园猫（橘白）', gender: '母', birthday: '2024-07-13', adopt_date: '2024-08-22', weight: 4.2, color: '橘白', chip_no: 'CN-9001-2023-0451', sterilized: 1, note: '挑食，只吃鸡胸和罐头；喜欢纸箱和阳台晒太阳。' },
    { name: '豆豆', species: '狗', breed: '柯基', gender: '公', birthday: '2025-07-08', adopt_date: '2025-08-17', weight: 11.6, color: '三色', sterilized: 1, note: '精力旺盛，每天两次遛弯；对鸡肉过敏，主粮选鸭肉配方。' },
    { name: '雪球', species: '其他', breed: '垂耳兔', gender: '公', birthday: '2025-12-15', adopt_date: '2026-01-24', weight: 1.8, color: '纯白', note: '无限量提摩西干草 + 少量兔粮，注意牙齿磨耗。' },
  ];
  const petIds = {};
  for (const p of pets) {
    const r = await api('/api/pets', { method: 'POST', body: p, cookie });
    petIds[p.name] = r.json.data.id;
  }
  // 体重曲线
  const series = { 咪咪: [4.05, 4.1, 4.15, 4.2, 4.18, 4.2, 4.22, 4.2], 豆豆: [10.8, 11.0, 11.3, 11.4, 11.5, 11.6, 11.6, 11.6] };
  for (const [name, list] of Object.entries(series)) {
    for (let i = 0; i < list.length; i++) {
      const d = new Date(Date.now() - (list.length - 1 - i) * 7 * 86400000).toISOString().slice(0, 10);
      await api('/api/weights', { method: 'POST', body: { pet_id: petIds[name], date: d, weight: list[i], note: i === list.length - 1 ? '本周测量' : '' }, cookie });
    }
  }
  // 健康记录
  const iso = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  await api('/api/health', { method: 'POST', body: { pet_id: petIds['咪咪'], type: '疫苗', name: '猫三联加强', happened_at: iso(-330), next_due: iso(35), hospital: '安心动物医院', doctor: '王医生', cost: 180, weight: 4.1, result: '抗体良好' }, cookie });
  await api('/api/health', { method: 'POST', body: { pet_id: petIds['咪咪'], type: '驱虫', name: '体内外同驱（大宠爱）', happened_at: iso(-58), next_due: iso(2), cost: 120, weight: 4.2, result: '无异常' }, cookie });
  await api('/api/health', { method: 'POST', body: { pet_id: petIds['豆豆'], type: '疫苗', name: '狂犬疫苗', happened_at: iso(-300), next_due: iso(65), cost: 150, weight: 11.2, result: '接种顺利' }, cookie });
  await api('/api/health', { method: 'POST', body: { pet_id: petIds['豆豆'], type: '就诊', name: '右后腿轻微跛行', happened_at: iso(-75), hospital: '汪汪宠物医院', cost: 420, weight: 11.4, result: '软组织拉伤，休息两周' }, cookie });
  // 喂食计划
  const plans = [
    [petIds['咪咪'], '07:30', '主食罐头（鸡肉味）', '罐头', 85, 'g'],
    [petIds['咪咪'], '19:00', '鸡肉南瓜猫饭', '自制', 90, 'g'],
    [petIds['豆豆'], '07:00', '鸭肉配方主粮', '主粮', 130, 'g'],
    [petIds['豆豆'], '18:30', '低温慢煮鸭肉狗饭', '自制', 150, 'g'],
    [petIds['雪球'], '08:00', '成年兔粮', '主粮', 25, 'g'],
  ];
  for (const [petId, time, food, type, amount, unit] of plans) {
    await api('/api/feeding-plans', { method: 'POST', body: { pet_id: petId, time_of_day: time, food_name: food, food_type: type, amount, unit, days: '1,2,3,4,5,6,7', active: 1 }, cookie });
  }
  // 打卡一顿
  const today = new Date().toISOString().slice(0, 10);
  const planList = await api('/api/feeding-plans', { cookie });
  await api('/api/feeding/complete', { method: 'POST', body: { plan_id: planList.json.data.items[0].id, date: today }, cookie });
  // 日记
  const diaries = [
    [petIds['咪咪'], '喂食', '开心', '早餐吃得干干净净', '换了新的鸡肉罐头，咪咪一口气吃完，还舔了碗三遍。'],
    [petIds['咪咪'], '便便', '平常', '便便成型', '颜色偏深，形状正常，没有软便。'],
    [petIds['豆豆'], '遛弯', '兴奋', '晨间遛弯 40 分钟', '公园遇到三只小伙伴，跑得很欢，回家喝了半碗水。'],
    [petIds['豆豆'], '训练', '开心', '学会了「趴下」', '用冻干做奖励，10 分钟就学会了趴下，连续成功率 8/10。'],
    [petIds['雪球'], '喂食', '平常', '兔粮减量', '按医生建议减少兔粮，增加提摩西干草，胃口不错。'],
  ];
  for (const [petId, category, mood, title, content] of diaries) {
    await api('/api/diary', { method: 'POST', body: { pet_id: petId, happened_at: new Date().toISOString(), category, mood, title, content, photos: [] }, cookie });
  }
  // 提醒
  const reminders = [
    ['体内外驱虫（每月）', '驱虫', iso(2), 30, '大宠爱滴剂，注意滴在后颈皮肤'],
    ['猫三联加强针', '疫苗', iso(35), 365, '提前一周预约医院'],
    ['每周刷牙 3 次', '其他', iso(0), 3, '用宠物专用牙膏'],
    ['牙齿复查', '复诊', iso(-5), 0, '已过期，尽快预约小宠专科'],
  ];
  for (const [title, type, due, repeat, note] of reminders) {
    await api('/api/reminders', { method: 'POST', body: { pet_id: petIds['咪咪'], title, type, due_date: due, repeat_days: repeat, note }, cookie });
  }
  // 食谱
  const recipes = [
    {
      name: '鸡肉南瓜猫饭（熟自制基础版）', for_pet: '猫', category: '主食',
      ingredients: [
        { name: '鸡胸肉', amount: 500, unit: 'g' }, { name: '鸡心', amount: 80, unit: 'g' },
        { name: '鸡肝', amount: 50, unit: 'g' }, { name: '南瓜（熟）', amount: 60, unit: 'g' },
        { name: '蛋黄', amount: 30, unit: 'g' }, { name: '蛋壳粉', amount: 6, unit: 'g' },
        { name: '牛磺酸粉', amount: 1, unit: 'g' }, { name: '鱼油', amount: 5, unit: 'g' },
      ],
      steps: '1. 鸡胸、鸡心、鸡肝冷水下锅，煮 12 分钟至全熟。\n2. 南瓜蒸熟压泥。\n3. 肉类打碎与南瓜泥拌匀。\n4. 关火后加入蛋壳粉、牛磺酸粉、鱼油。',
      tips: '熟自制必须补钙：无骨肉配方按每 100g 肉加 0.8~1g 蛋壳粉。牛磺酸不耐高温。', batch_weight: 732,
    },
    {
      name: '低温慢煮鸭肉狗饭（低敏配方）', for_pet: '狗', category: '主食',
      ingredients: [
        { name: '鸭胸肉', amount: 800, unit: 'g' }, { name: '牛心', amount: 120, unit: 'g' },
        { name: '牛肝', amount: 60, unit: 'g' }, { name: '胡萝卜（熟）', amount: 100, unit: 'g' },
        { name: '西兰花', amount: 80, unit: 'g' }, { name: '燕麦（熟）', amount: 100, unit: 'g' },
        { name: '碳酸钙粉', amount: 8, unit: 'g' }, { name: '鱼油', amount: 8, unit: 'g' },
      ],
      steps: '1. 鸭胸肉 70℃ 低温慢煮 40 分钟。\n2. 牛心、牛肝蒸熟切碎。\n3. 蔬菜蒸软切碎，燕麦煮熟。\n4. 全部拌匀并补钙。',
      tips: '鸡肉过敏犬可用鸭肉替代。换粮需 7 天过渡。', batch_weight: 1276,
    },
    {
      name: '沙丁鱼补钙小鱼冻（加餐）', for_pet: '猫狗通用', category: '加餐',
      ingredients: [
        { name: '沙丁鱼（连骨）', amount: 300, unit: 'g' }, { name: '鸡蛋（全蛋）', amount: 100, unit: 'g' },
        { name: '南瓜（熟）', amount: 50, unit: 'g' },
      ],
      steps: '1. 沙丁鱼连骨蒸熟。\n2. 鸡蛋蒸成蛋羹。\n3. 打碎后倒入冰格冷冻，每次取 1~2 块。',
      tips: '适合作为拌粮加餐，不建议超过每日热量 10%。', batch_weight: 450,
    },
  ];
  for (const r of recipes) await api('/api/recipes', { method: 'POST', body: r, cookie });
  console.log('  演示数据写入完成');

  /* 3) 已登录：通过调试通道注入会话 Cookie 后截图 */
  const shotUrl = (hash, click = '') => {
    // 注意：查询串必须放在 # 之前，否则会被当成 hash 的一部分
    const debug = click ? `?t=${SHOT_TOKEN}&click=${encodeURIComponent(click)}` : '';
    const to = encodeURIComponent(`${BASE}/${debug}${hash}`);
    const c = encodeURIComponent(cookie.replace(/^pd_session=/, ''));
    return `${BASE}/__shot?t=${SHOT_TOKEN}&c=pd_session%3D${c}&to=${to}`;
  };
  const pages = [
    ['ui-02-dashboard', '#/dashboard'],
    ['ui-03-pets', '#/pets'],
    ['ui-04-diary', '#/diary'],
    ['ui-05-health', '#/health'],
    ['ui-06-feeding', '#/feeding'],
    ['ui-07-recipes', '#/recipes'],
    ['ui-08-reminders', '#/reminders'],
    ['ui-09-settings', '#/settings'],
  ];
  for (const [name, hash] of pages) {
    await shot(name, shotUrl(hash), { height: 1300 });
    console.log(`  ✓ ${name}.png`);
  }
  await shot('ui-10-mobile', shotUrl('#/dashboard'), { width: 430, height: 1100 });
  console.log('  ✓ ui-10-mobile.png（手机尺寸）');

  /* 4) 交互状态：账号设置弹窗、宠物详情、配方详情、移动端宠物选择 */
  await shot('ui-11-account', shotUrl('#/dashboard', '#userChip'), { height: 1000 });
  console.log('  ✓ ui-11-account.png（账号设置弹窗）');
  await shot('ui-12-pet-detail', shotUrl('#/pets', '[data-action=detail]'), { height: 1250 });
  console.log('  ✓ ui-12-pet-detail.png（宠物档案详情）');
  await shot('ui-13-recipe-detail', shotUrl('#/recipes', '[data-action=detail]'), { height: 1250 });
  console.log('  ✓ ui-13-recipe-detail.png（配方营养分析）');
  await shot('ui-14-mobile-switcher', shotUrl('#/dashboard', '#petSwitcherBtn'), { width: 430, height: 950 });
  console.log('  ✓ ui-14-mobile-switcher.png（移动端宠物选择）');
} catch (err) {
  console.error('截图失败：', err.message);
  process.exitCode = 1;
} finally {
  server.kill();
  await sleep(300);
  if (!process.argv.includes('--keep')) {
    fs.rmSync(TMP_DATA, { recursive: true, force: true });
    fs.rmSync(PROFILE, { recursive: true, force: true });
  }
  console.log(`\n截图输出目录：${OUT}\n`);
}
