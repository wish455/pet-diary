/**
 * 公网部署自检：node tests/smoke.mjs
 * 覆盖：静态资源、未登录拦截、注册/登录/登出、多用户数据隔离、
 *       越权访问、业务链路、上传、备份恢复、级联删除、错误处理。
 * 需要先启动服务（默认 http://127.0.0.1:3000）
 */
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let pass = 0;
let failCount = 0;

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    failCount++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

/** 带 Cookie 的请求客户端（模拟一个浏览器会话） */
function client() {
  let cookie = '';
  return {
    get cookie() {
      return cookie;
    },
    async call(method, url, body, isForm = false) {
      const opts = { method, headers: {} };
      if (cookie) opts.headers.Cookie = cookie;
      if (body !== undefined) {
        if (isForm) opts.body = body;
        else {
          opts.headers['Content-Type'] = 'application/json';
          opts.body = JSON.stringify(body);
        }
      }
      const res = await fetch(BASE + url, opts);
      const setCookie = res.headers.getSetCookie?.() || [];
      for (const c of setCookie) {
        const kv = c.split(';')[0];
        if (kv.startsWith('pd_session=')) cookie = kv.endsWith('=') ? '' : kv;
      }
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text.slice(0, 120);
      }
      return { status: res.status, json, headers: res.headers };
    },
    get: (u) => this.call('GET', u),
  };
}

const stamp = Date.now().toString(36);
const userA = { username: `alice_${stamp}`, password: 'alice-pass-8888', nickname: '爱丽丝' };
const userB = { username: `bob_${stamp}`, password: 'bob-pass-8888', nickname: '鲍勃' };

const anon = client();
const A = client();
const B = client();

/* ---------------- 静态资源与安全响应头 ---------------- */
console.log('\n【静态资源与响应头】');
for (const p of ['/', '/styles.css', '/js/app.js', '/js/ui.js', '/js/charts.js', '/js/pages/dashboard.js', '/js/pages/settings.js']) {
  const res = await fetch(BASE + p);
  check(`静态资源 ${p}`, res.status === 200, `HTTP ${res.status}`);
}
{
  const res = await fetch(BASE + '/');
  check('CSP 响应头存在', !!res.headers.get('content-security-policy'));
  check('X-Frame-Options=DENY', res.headers.get('x-frame-options') === 'DENY');
  check('X-Content-Type-Options=nosniff', res.headers.get('x-content-type-options') === 'nosniff');
}
{
  const res = await fetch(BASE + '/healthz');
  const body = await res.json();
  check('GET /healthz 健康检查', res.status === 200 && body.ok === true);
}

/* ---------------- 未登录必须被拦截 ---------------- */
console.log('\n【未登录访问控制】');
for (const p of ['/api/dashboard', '/api/pets', '/api/diary', '/api/health', '/api/recipes', '/api/reminders', '/api/albums', '/api/feeding/today', '/api/backup/export']) {
  const res = await anon.call('GET', p);
  check(`${p} 未登录返回 401`, res.status === 401, `HTTP ${res.status}`);
}
{
  const res = await anon.call('POST', '/api/pets', { name: '偷偷创建' });
  check('POST /api/pets 未登录返回 401', res.status === 401);
}
{
  const res = await anon.call('GET', '/api/auth/status');
  check('GET /api/auth/status 可匿名访问', res.status === 200 && res.json.data.user === null, `注册开放=${res.json?.data?.registration_open}`);
}

/* ---------------- 注册与登录 ---------------- */
console.log('\n【账号：注册 / 登录 / 登出】');
{
  const weak = await anon.call('POST', '/api/auth/register', { username: userA.username, password: '123' });
  check('弱密码被拒绝', weak.status === 400, weak.json?.error);
}
{
  const badName = await anon.call('POST', '/api/auth/register', { username: 'a', password: 'longenough123' });
  check('非法用户名被拒绝', badName.status === 400, badName.json?.error);
}
{
  const reg = await A.call('POST', '/api/auth/register', userA);
  check('注册账号 A 成功', reg.status === 200 && reg.json.data.user.username === userA.username, `角色=${reg.json?.data?.user?.role}`);
  check('注册后自动写入会话 Cookie', A.cookie.startsWith('pd_session=') && A.cookie.length > 20);
}
{
  const dup = await anon.call('POST', '/api/auth/register', { ...userA, username: userA.username.toUpperCase() });
  check('重复用户名（大小写不敏感）被拒绝', dup.status === 400, dup.json?.error);
}
{
  const reg = await B.call('POST', '/api/auth/register', userB);
  check('注册账号 B 成功', reg.status === 200);
}
{
  const wrong = await client().call('POST', '/api/auth/login', { username: userA.username, password: '错误密码' });
  check('错误密码返回 401', wrong.status === 401, wrong.json?.error);
}
{
  const c = client();
  const login = await c.call('POST', '/api/auth/login', { username: userA.username, password: userA.password });
  check('正确密码登录成功', login.status === 200 && login.json.data.user.username === userA.username);
  const logout = await c.call('POST', '/api/auth/logout');
  check('登出成功', logout.status === 200);
  const after = await c.call('GET', '/api/pets');
  check('登出后访问需登录接口返回 401', after.status === 401);
}

/* ---------------- 数据隔离 ---------------- */
console.log('\n【多用户数据隔离】');
let petA;
let petB;
{
  const r = await A.call('POST', '/api/pets', { name: 'A 的猫', species: '猫', weight: 4.1, birthday: '2024-01-01' });
  petA = r.json.data;
  check('A 创建宠物', r.status === 200 && petA.id > 0, `id=${petA?.id}`);
  const r2 = await B.call('POST', '/api/pets', { name: 'B 的狗', species: '狗', weight: 12 });
  petB = r2.json.data;
  check('B 创建宠物', r2.status === 200 && petB.id > 0, `id=${petB?.id}`);
}
{
  const listA = await A.call('GET', '/api/pets');
  const listB = await B.call('GET', '/api/pets');
  check('A 的列表只包含自己的宠物', listA.json.data.items.every((p) => p.id !== petB.id) && listA.json.data.items.some((p) => p.id === petA.id), `A 看到 ${listA.json.data.total} 只`);
  check('B 的列表只包含自己的宠物', listB.json.data.items.every((p) => p.id !== petA.id) && listB.json.data.items.some((p) => p.id === petB.id), `B 看到 ${listB.json.data.total} 只`);
}
{
  const getOther = await B.call('GET', `/api/pets/${petA.id}`);
  check('B 直接读 A 的宠物返回 404', getOther.status === 404, getOther.json?.error);
  const updOther = await B.call('PUT', `/api/pets/${petA.id}`, { name: '被改名了' });
  check('B 修改 A 的宠物返回 404', updOther.status === 404);
  const delOther = await B.call('DELETE', `/api/pets/${petA.id}`);
  check('B 删除 A 的宠物返回 404', delOther.status === 404);
  const detailOther = await B.call('GET', `/api/pets/${petA.id}/detail`);
  check('B 读取 A 的宠物详情返回 404', detailOther.status === 404);
}
{
  const writeToOther = await B.call('POST', '/api/diary', {
    pet_id: petA.id,
    happened_at: new Date().toISOString(),
    category: '喂食',
    title: '越权写入',
  });
  check('B 往 A 的宠物写日记被拒绝', writeToOther.status === 404, writeToOther.json?.error);
}
{
  const crossWeight = await B.call('POST', '/api/weights', { pet_id: petA.id, date: '2026-01-01', weight: 5 });
  check('B 往 A 的宠物写体重被拒绝', crossWeight.status === 404);
  const crossPlan = await B.call('POST', '/api/feeding-plans', { pet_id: petA.id, food_name: '越权计划', amount: 10 });
  check('B 往 A 的宠物写喂食计划被拒绝', crossPlan.status === 404);
  const crossReminder = await B.call('POST', '/api/reminders', { pet_id: petA.id, title: '越权提醒', due_date: '2026-12-31' });
  check('B 往 A 的宠物写提醒被拒绝', crossReminder.status === 404);
}
{
  const dashA = await A.call('GET', '/api/dashboard');
  const dashB = await B.call('GET', '/api/dashboard');
  check('A 的总览只统计自己的数据', dashA.json.data.pets.every((p) => p.id !== petB.id), `A 宠物数=${dashA.json.data.stats.pet_count}`);
  check('B 的总览只统计自己的数据', dashB.json.data.pets.every((p) => p.id !== petA.id), `B 宠物数=${dashB.json.data.stats.pet_count}`);
}

/* ---------------- 业务链路（以 A 的身份） ---------------- */
console.log('\n【业务链路：日记 / 体重 / 健康 / 提醒 / 喂食】');
let diaryId;
let photoUrl;
{
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2NkYPjPQAxgYiASjCocVTiqcNAqBABG7QEBrfjPjwAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/png' }), 't.png');
  const up = await A.call('POST', '/api/upload', fd, true);
  photoUrl = up.json?.data?.url;
  check('上传图片成功且路径按用户隔离', up.status === 200 && photoUrl.startsWith(`/uploads/u`), photoUrl);
  const img = await fetch(BASE + photoUrl);
  check('上传的图片可访问', img.status === 200 && img.headers.get('content-type')?.includes('image'));
  const svg = new FormData();
  svg.append('file', new Blob([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')], { type: 'image/svg+xml' }), 'x.svg');
  const bad = await A.call('POST', '/api/upload', svg, true);
  check('SVG 上传被拒绝（防脚本注入）', bad.status === 400, bad.json?.error);
}
{
  const otherDelete = await B.call('POST', '/api/upload/delete', { url: photoUrl });
  check('B 不能删除 A 的图片', otherDelete.status === 403);
}
{
  const d = await A.call('POST', '/api/diary', {
    pet_id: petA.id,
    happened_at: new Date().toISOString(),
    category: '玩耍',
    mood: '开心',
    title: '自检日记',
    content: '多用户隔离测试',
    photos: [photoUrl],
  });
  diaryId = d.json?.data?.id;
  check('创建带照片的日记', d.status === 200 && diaryId > 0);
  const album = await A.call('GET', '/api/albums');
  check('A 的相册包含自己的照片', album.json.data.photos.some((p) => p.url === photoUrl));
  const albumB = await B.call('GET', '/api/albums');
  check('B 的相册看不到 A 的照片', !albumB.json.data.photos.some((p) => p.url === photoUrl));
}
{
  const w1 = await A.call('POST', '/api/weights', { pet_id: petA.id, date: '2026-01-01', weight: 4.0 });
  const w2 = await A.call('POST', '/api/weights', { pet_id: petA.id, date: '2026-02-01', weight: 4.3 });
  check('记录体重', w1.status === 200 && w2.status === 200);
  const pet = await A.call('GET', `/api/pets/${petA.id}`);
  check('体重自动同步到宠物当前体重', Number(pet.json.data.weight) === 4.3, `weight=${pet.json.data.weight}`);
  const detail = await A.call('GET', `/api/pets/${petA.id}/detail`);
  check('体重曲线数据只含自己的记录', detail.json.data.weights.length === 2, `${detail.json.data.weights.length} 条`);
}
{
  const h = await A.call('POST', '/api/health', { pet_id: petA.id, type: '疫苗', name: '猫三联', happened_at: '2026-03-01', next_due: '2027-03-01', cost: 200 });
  check('创建健康记录', h.status === 200);
  const healthB = await B.call('GET', '/api/health');
  check('B 看不到 A 的健康记录', healthB.json.data.items.every((x) => x.id !== h.json.data.id));
}
{
  const r = await A.call('POST', '/api/reminders', { pet_id: petA.id, title: '每月驱虫', type: '驱虫', due_date: '2020-01-01', repeat_days: 30 });
  const remId = r.json.data.id;
  const done = await A.call('POST', `/api/reminders/${remId}/complete`);
  check('重复提醒完成后自动顺延', done.json?.data?.due_date > new Date().toISOString().slice(0, 10), `下次 ${done.json?.data?.due_date}`);
  const cross = await B.call('POST', `/api/reminders/${remId}/complete`);
  check('B 不能操作 A 的提醒', cross.status === 404);
}
{
  const plan = await A.call('POST', '/api/feeding-plans', { pet_id: petA.id, time_of_day: '08:00', food_name: '测试主粮', amount: 100, unit: 'g', days: '1,2,3,4,5,6,7', active: 1 });
  const planId = plan.json.data.id;
  const c1 = await A.call('POST', '/api/feeding/complete', { plan_id: planId });
  check('喂食打卡', c1.json?.data?.done === true);
  const todayFeed = await A.call('GET', '/api/feeding/today');
  check('今日喂食只包含自己的计划', todayFeed.json.data.schedule.every((s) => s.plan.id !== undefined) && todayFeed.json.data.schedule.some((s) => s.plan.id === planId));
  const cross = await B.call('POST', '/api/feeding/complete', { plan_id: planId });
  check('B 不能给 A 的计划打卡', cross.status === 404);
  const c2 = await A.call('POST', '/api/feeding/complete', { plan_id: planId });
  check('再次打卡可撤销', c2.json?.data?.done === false);
}
{
  const recipe = await A.call('POST', '/api/recipes', {
    name: '自检配方',
    for_pet: '猫',
    category: '主食',
    ingredients: [
      { name: '鸡胸肉', amount: 500, unit: 'g' },
      { name: '鸡肝', amount: 50, unit: 'g' },
      { name: '蛋壳粉', amount: 6, unit: 'g' },
    ],
    batch_weight: 556,
  });
  check('创建食谱', recipe.status === 200);
  const an = await A.call('POST', '/api/recipes/analyze', { recipe_id: recipe.json.data.id, weightKg: 4.2, species: '猫', stageKey: 'adult_neutered' });
  const a = an.json?.data;
  check('营养分析返回热量与钙磷比', a?.analysis?.per100?.kcal > 0 && a?.analysis?.caP > 0, `${a?.analysis?.per100?.kcal?.toFixed(0)} kcal/100g, Ca:P=${a?.analysis?.caP?.toFixed(2)}`);
  check('按体重算出每日喂食量', a?.suggestion?.gramsPerDay > 50, `${a?.suggestion?.gramsPerDay?.toFixed(0)} g/天`);
  const crossAnalyze = await B.call('POST', '/api/recipes/analyze', { recipe_id: recipe.json.data.id });
  check('B 不能读取 A 的配方做分析', crossAnalyze.status === 404);
}

/* ---------------- 备份只导出自己的数据 ---------------- */
console.log('\n【备份与恢复（按账号隔离）】');
let backup;
{
  const res = await fetch(`${BASE}/api/backup/export`, { headers: { Cookie: A.cookie } });
  backup = await res.json();
  check('导出备份成功', res.status === 200 && Array.isArray(backup.tables.pets));
  check('备份只含自己的宠物', backup.tables.pets.length === 1 && backup.tables.pets[0].id === petA.id, `${backup.tables.pets.length} 只`);
  check('备份只含自己的日记', backup.tables.diary.every((d) => d.id === diaryId || d.pet_id === petA.id));
}
{
  const importB = await fetch(`${BASE}/api/backup/import`, {
    method: 'POST',
    headers: { Cookie: B.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(backup),
  });
  check('B 导入 A 的备份成功（写入自己账号）', importB.status === 200);
  const listB = await B.call('GET', '/api/pets');
  const imported = listB.json.data.items.find((p) => p.name === 'A 的猫');
  check('导入后宠物归属 B 而不是 A', !!imported, `B 现在有 ${listB.json.data.total} 只`);
  check('导入产生的是新记录（未覆盖 A 的记录）', !!imported && imported.id !== petA.id, `原 id=${petA.id}，新 id=${imported?.id}`);
  const listA = await A.call('GET', '/api/pets');
  check('A 的数据没有被 B 的导入影响', listA.json.data.total === 1 && listA.json.data.items[0].id === petA.id, `A 有 ${listA.json.data.total} 只，id=${listA.json.data.items[0]?.id}`);
}

/* ---------------- 账号资料与密码 ---------------- */
console.log('\n【账号资料与修改密码】');
{
  const prof = await A.call('PUT', '/api/auth/profile', { nickname: '新的昵称', email: 'a@example.com' });
  check('更新昵称与邮箱', prof.status === 200 && prof.json.data.nickname === '新的昵称');
  const bad = await A.call('POST', '/api/auth/password', { old_password: '错误', new_password: 'newpass12345' });
  check('旧密码错误时拒绝改密', bad.status === 400, bad.json?.error);
  const okPwd = await A.call('POST', '/api/auth/password', { old_password: userA.password, new_password: 'newpass12345' });
  check('修改密码成功', okPwd.status === 200);
  const relogin = await client().call('POST', '/api/auth/login', { username: userA.username, password: 'newpass12345' });
  check('新密码可以登录', relogin.status === 200);
  const oldPwd = await client().call('POST', '/api/auth/login', { username: userA.username, password: userA.password });
  check('旧密码无法登录', oldPwd.status === 401);
}

/* ---------------- 管理员与限流 ---------------- */
console.log('\n【管理员权限与登录限流】');
{
  const adminOnB = await B.call('GET', '/api/admin/users');
  check('普通用户不能看账号列表', adminOnB.status === 403, adminOnB.json?.error);

  // 改密后重新登录一个管理员会话，验证平台管理接口
  const { DatabaseSync } = await import('node:sqlite');
  const { dbFile } = await import('./db-path.mjs');
  const d = new DatabaseSync(dbFile());
  d.prepare("UPDATE users SET role = 'admin' WHERE username = ?").run(userA.username);
  d.close();

  const admin = client();
  const login = await admin.call('POST', '/api/auth/login', { username: userA.username, password: 'newpass12345' });
  check('改密后重新登录成功', login.status === 200, `角色=${login.json?.data?.user?.role}`);
  const adminOnA = await admin.call('GET', '/api/admin/users');
  const users = Array.isArray(adminOnA.json?.data) ? adminOnA.json.data : [];
  check('管理员可以看账号列表', adminOnA.status === 200 && users.length >= 2, `${users.length} 个账号`);
  const meRow = users.find((u) => u.username === userA.username);
  const other = users.find((u) => u.username === userB.username);
  const self = await admin.call('POST', `/api/admin/users/${meRow.id}/status`, { status: 'disabled' });
  check('管理员不能停用自己', self.status === 400);
  const disable = await admin.call('POST', `/api/admin/users/${other.id}/status`, { status: 'disabled' });
  check('管理员停用其他账号', disable.status === 200);
  const blocked = await B.call('GET', '/api/pets');
  check('被停用账号的会话立即失效', blocked.status === 401);
  const reEnable = await admin.call('POST', `/api/admin/users/${other.id}/status`, { status: 'active' });
  check('恢复账号成功', reEnable.status === 200);
  const reloginB = await client().call('POST', '/api/auth/login', { username: userB.username, password: userB.password });
  check('被停用过的账号重新启用后可登录', reloginB.status === 200);
}
{
  const victim = `limit_${stamp}`;
  let last = null;
  for (let i = 0; i < 10; i++) {
    last = await client().call('POST', '/api/auth/login', { username: victim, password: 'wrongpass' });
    if (last.status === 429) break;
  }
  check('连续失败登录触发限流（429）', last.status === 429, last.json?.error);
}

/* ---------------- 清理 ---------------- */
console.log('\n【清理测试数据】');
{
  await A.call('DELETE', `/api/diary/${diaryId}`);
  await A.call('DELETE', `/api/pets/${petA.id}`);
  const gone = await A.call('GET', `/api/pets/${petA.id}`);
  check('删除宠物后其详情返回 404（级联删除）', gone.status === 404);
  const diaryGone = await A.call('GET', `/api/diary/${diaryId}`);
  check('宠物删除后日记一并删除', diaryGone.status === 404);
  await B.call('DELETE', `/api/pets/${petB.id}`);
}

console.log(`\n结果：通过 ${pass}，失败 ${failCount}\n`);
process.exit(failCount ? 1 : 0);
