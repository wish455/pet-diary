/** 全部 API 路由：账号会话 + 按登录用户隔离的业务接口 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, now, UPLOAD_DIR, parseJSON, USER_TABLES, orphanCount, adoptOrphans } from './db.js';
import { ok, fail, readJSON, parseMultipart, getBoundary, EXT_BY_MIME, serveStatic } from './http-utils.js';
import { crudRoutes } from './crud.js';
import { INGREDIENTS, LIFE_STAGES, analyzeRecipe, feedingSuggestion } from './nutrition.js';
import {
  createSession, getSession, destroySession, destroyUserSessions, cleanExpiredSessions,
  sessionCookie, clearCookie, cookieName, parseCookies, publicUser, createUser, findUserByName,
  verifyPassword, verifyUserPassword, updatePassword, registrationOpen, inviteCode, countUsers,
  rateLimit, recordFailure, clearFailures, assignAvatar,
} from './auth.js';

/* ------------------------------- 工具 ------------------------------- */

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function ageText(birthday) {
  if (!birthday) return { text: '未知', months: null };
  const b = new Date(birthday);
  if (Number.isNaN(b.getTime())) return { text: '未知', months: null };
  const nowD = new Date();
  let months = (nowD.getFullYear() - b.getFullYear()) * 12 + (nowD.getMonth() - b.getMonth());
  if (nowD.getDate() < b.getDate()) months -= 1;
  if (months < 0) return { text: '未出生', months: 0 };
  const y = Math.floor(months / 12);
  const m = months % 12;
  const text = y > 0 ? (m > 0 ? `${y}岁${m}个月` : `${y}岁`) : `${m}个月`;
  return { text, months };
}

function petWithMeta(pet) {
  if (!pet) return pet;
  const age = ageText(pet.birthday);
  return { ...pet, age_text: age.text, age_months: age.months };
}

function ownPet(userId, id) {
  return db.prepare('SELECT * FROM pets WHERE id = ? AND user_id = ?').get(id, userId);
}

/* ------------------------------- 认证 ------------------------------- */

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

async function authStatus(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const found = getSession(cookies[cookieName()]);
  ok(res, {
    user: found ? publicUser(found.user) : null,
    registration_open: registrationOpen(),
    invite_required: !!inviteCode(),
    user_count: countUsers(),
  });
}

async function authRegister(req, res) {
  if (!registrationOpen()) return fail(res, 403, '本站已关闭注册，请联系管理员开通账号');
  const body = await readJSON(req);
  const code = inviteCode();
  if (code && String(body.invite_code || '').trim() !== code) return fail(res, 403, '邀请码不正确');

  const ip = clientIp(req);
  const limit = rateLimit(`reg:${ip}`);
  if (limit.blocked) return fail(res, 429, `操作过于频繁，请 ${Math.ceil(limit.retryAfter / 60)} 分钟后再试`);

  try {
    const first = countUsers() === 0;
    const user = createUser({
      username: body.username,
      password: body.password,
      nickname: body.nickname,
      email: body.email,
      role: first ? 'admin' : 'user',
    });
    db.prepare('UPDATE users SET avatar = ?, last_login_at = ? WHERE id = ?').run(assignAvatar(user.id, user.nickname || user.username), now(), user.id);
    // 第一个账号接管升级前遗留的、无归属的数据
    let adopted = 0;
    if (first) adopted = adoptOrphans(user.id);
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    const { token, expires } = createSession(user.id, { userAgent: req.headers['user-agent'], ip });
    res.setHeader('Set-Cookie', sessionCookie(token, expires));
    ok(res, { user: publicUser(fresh), adopted_records: adopted, is_first_user: first });
  } catch (err) {
    recordFailure(`reg:${ip}`);
    fail(res, 400, err.message);
  }
}

async function authLogin(req, res) {
  const body = await readJSON(req);
  const ip = clientIp(req);
  const username = String(body.username || '').trim();
  const key = `login:${ip}:${username.toLowerCase()}`;
  const limit = rateLimit(key);
  if (limit.blocked) return fail(res, 429, `尝试次数过多，请 ${Math.ceil(limit.retryAfter / 60)} 分钟后再试`);

  const user = findUserByName(username);
  if (!user || !verifyPassword(body.password, user.password_hash)) {
    recordFailure(key);
    return fail(res, 401, '用户名或密码不正确');
  }
  if (user.status !== 'active') return fail(res, 403, '该账号已被停用，请联系管理员');

  clearFailures(key);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), user.id);
  const { token, expires } = createSession(user.id, { userAgent: req.headers['user-agent'], ip });
  res.setHeader('Set-Cookie', sessionCookie(token, expires));
  ok(res, { user: publicUser(user), sessions: db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = ?').get(user.id).c });
}

async function authLogout(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  destroySession(cookies[cookieName()]);
  res.setHeader('Set-Cookie', clearCookie());
  ok(res, { ok: true });
}

async function authPassword(req, res, _url, user) {
  const body = await readJSON(req);
  if (!verifyUserPassword(user.id, body.old_password)) return fail(res, 400, '当前密码不正确');
  try {
    updatePassword(user.id, body.new_password);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  // 保留当前会话与已登录的其他设备，改密后无需重新登录
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  ok(res, { ok: true, user: publicUser(fresh) });
}

async function authProfile(req, res, _url, user) {
  const body = await readJSON(req);
  const nickname = String(body.nickname ?? user.nickname).slice(0, 30);
  const email = String(body.email ?? user.email).slice(0, 120);
  db.prepare('UPDATE users SET nickname = ?, email = ? WHERE id = ?').run(nickname, email, user.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  ok(res, publicUser(fresh));
}

/** 管理员：账号列表 */
async function adminUsers(req, res, _url, user) {
  if (user.role !== 'admin') return fail(res, 403, '只有管理员可以查看账号列表');
  const users = db.prepare('SELECT id, username, nickname, email, role, status, created_at, last_login_at FROM users ORDER BY id ASC').all();
  const withCounts = users.map((u) => ({
    ...u,
    pet_count: db.prepare('SELECT COUNT(*) c FROM pets WHERE user_id = ?').get(u.id).c,
    diary_count: db.prepare('SELECT COUNT(*) c FROM diary WHERE user_id = ?').get(u.id).c,
  }));
  ok(res, withCounts);
}

/** 管理员：启停账号 */
async function adminSetStatus(req, res, _url, user, id) {
  if (user.role !== 'admin') return fail(res, 403, '只有管理员可以操作');
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  if (!target) return fail(res, 404, '账号不存在');
  if (target.id === user.id) return fail(res, 400, '不能停用自己的账号');
  const body = await readJSON(req);
  const status = body.status === 'disabled' ? 'disabled' : 'active';
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, target.id);
  if (status === 'disabled') destroyUserSessions(target.id);
  ok(res, { id: target.id, status });
}

/* ------------------------------- CRUD ------------------------------- */

const crud = {
  pets: crudRoutes({
    table: 'pets',
    fields: ['name', 'species', 'breed', 'gender', 'birthday', 'adopt_date', 'weight', 'color', 'chip_no', 'sterilized', 'status', 'avatar', 'note', 'sort', 'created_at', 'updated_at'],
    defaultOrder: 'sort ASC, id ASC',
    filterable: ['species', 'status'],
    mapRow: petWithMeta,
    beforeDelete: (row, user) => {
      // 删除宠物前清理其日记照片文件
      const photos = db.prepare("SELECT photos FROM diary WHERE pet_id = ? AND user_id = ?").all(row.id, user.id);
      for (const p of photos) {
        for (const url of parseJSON(p.photos, [])) {
          if (String(url).startsWith('/uploads/')) fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
        }
      }
    },
  }),
  diary: crudRoutes({
    table: 'diary',
    fields: ['pet_id', 'happened_at', 'category', 'mood', 'title', 'content', 'photos', 'created_at'],
    jsonFields: ['photos'],
    defaultOrder: 'happened_at DESC, id DESC',
    filterable: ['pet_id', 'category', 'mood'],
    petField: 'pet_id',
  }),
  health: crudRoutes({
    table: 'health',
    fields: ['pet_id', 'type', 'name', 'happened_at', 'next_due', 'hospital', 'doctor', 'cost', 'weight', 'result', 'note', 'created_at'],
    defaultOrder: 'happened_at DESC, id DESC',
    filterable: ['pet_id', 'type'],
    petField: 'pet_id',
    afterWrite: (row, action, _body, user) => {
      if (!row?.weight || !row?.happened_at) return;
      if (action === 'create') {
        db.prepare('INSERT INTO weight_log(user_id, pet_id, date, weight, note, created_at) VALUES(?,?,?,?,?,?)')
          .run(user.id, row.pet_id, row.happened_at.slice(0, 10), row.weight, '来自健康记录', now());
      }
      db.prepare('UPDATE pets SET weight = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(row.weight, now(), row.pet_id, user.id);
    },
  }),
  weight: crudRoutes({
    table: 'weight_log',
    fields: ['pet_id', 'date', 'weight', 'note', 'created_at'],
    defaultOrder: 'date ASC, id ASC',
    filterable: ['pet_id'],
    petField: 'pet_id',
    afterWrite: (row, _action, _body, user) => {
      const latest = db.prepare('SELECT weight FROM weight_log WHERE pet_id = ? AND user_id = ? ORDER BY date DESC, id DESC LIMIT 1').get(row.pet_id, user.id);
      if (latest) db.prepare('UPDATE pets SET weight = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(latest.weight, now(), row.pet_id, user.id);
    },
    beforeDelete: (row, user) => {
      const latest = db.prepare('SELECT weight FROM weight_log WHERE pet_id = ? AND user_id = ? AND id != ? ORDER BY date DESC, id DESC LIMIT 1').get(row.pet_id, user.id, row.id);
      if (latest) db.prepare('UPDATE pets SET weight = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(latest.weight, now(), row.pet_id, user.id);
    },
  }),
  feedingPlan: crudRoutes({
    table: 'feeding_plan',
    fields: ['pet_id', 'time_of_day', 'food_name', 'food_type', 'amount', 'unit', 'days', 'active', 'note', 'created_at'],
    defaultOrder: 'time_of_day ASC, id ASC',
    filterable: ['pet_id', 'active'],
    petField: 'pet_id',
  }),
  feedingLog: crudRoutes({
    table: 'feeding_log',
    fields: ['pet_id', 'plan_id', 'date', 'time_of_day', 'food_name', 'amount', 'unit', 'finished', 'note', 'created_at'],
    defaultOrder: 'date DESC, time_of_day DESC, id DESC',
    filterable: ['pet_id', 'date'],
    petField: 'pet_id',
  }),
  recipe: crudRoutes({
    table: 'recipe',
    fields: ['name', 'for_pet', 'category', 'ingredients', 'steps', 'tips', 'cover', 'batch_weight', 'is_public', 'created_at', 'updated_at'],
    jsonFields: ['ingredients'],
    defaultOrder: 'category ASC, id DESC',
    filterable: ['for_pet', 'category'],
  }),
  reminder: crudRoutes({
    table: 'reminder',
    fields: ['pet_id', 'title', 'type', 'due_date', 'repeat_days', 'done', 'done_at', 'note', 'created_at'],
    defaultOrder: 'done ASC, due_date ASC, id ASC',
    filterable: ['pet_id', 'type', 'done'],
    petField: 'pet_id',
  }),
};

/* ---------------------------- 特殊路由 ---------------------------- */

async function dashboard(req, res, _url, user) {
  const pets = db.prepare('SELECT * FROM pets WHERE user_id = ? ORDER BY sort ASC, id ASC').all(user.id).map(petWithMeta);
  const t = today();
  const upcoming = [];
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  for (const r of db.prepare('SELECT * FROM reminder WHERE user_id = ? AND done = 0 ORDER BY due_date ASC').all(user.id)) {
    if (r.due_date <= in30) upcoming.push({ source: '提醒', ...r, overdue: r.due_date < t, days: daysBetween(t, r.due_date) });
  }
  for (const h of db.prepare("SELECT * FROM health WHERE user_id = ? AND next_due IS NOT NULL AND next_due != '' ORDER BY next_due ASC").all(user.id)) {
    if (h.next_due <= in30) {
      upcoming.push({
        id: `h${h.id}`,
        source: '健康记录',
        pet_id: h.pet_id,
        title: `${h.type}·${h.name || '未命名'} 到期`,
        type: h.type,
        due_date: h.next_due,
        overdue: h.next_due < t,
        days: daysBetween(t, h.next_due),
      });
    }
  }
  for (const p of pets) {
    if (!p.birthday) continue;
    const b = new Date(p.birthday);
    if (Number.isNaN(b.getTime())) continue;
    const nextBirthday = new Date(new Date().getFullYear(), b.getMonth(), b.getDate());
    if (nextBirthday < new Date(t)) nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
    const iso = nextBirthday.toISOString().slice(0, 10);
    if (iso <= in30) upcoming.push({ id: `b${p.id}`, source: '生日', pet_id: p.id, title: `${p.name} 的生日`, type: '生日', due_date: iso, overdue: false, days: daysBetween(t, iso) });
  }
  upcoming.sort((a, b) => (a.due_date > b.due_date ? 1 : -1));

  const recentDiary = db
    .prepare(`SELECT d.*, p.name AS pet_name, p.avatar AS pet_avatar, p.species AS pet_species
              FROM diary d LEFT JOIN pets p ON p.id = d.pet_id
              WHERE d.user_id = ? ORDER BY d.happened_at DESC, d.id DESC LIMIT 6`)
    .all(user.id)
    .map((r) => ({ ...r, photos: parseJSON(r.photos, []) }));

  const todayFeedLogs = db.prepare('SELECT * FROM feeding_log WHERE user_id = ? AND date = ?').all(user.id, t);
  const weekday = new Date().getDay() === 0 ? 7 : new Date().getDay();
  const plansToday = [];
  for (const plan of db.prepare('SELECT * FROM feeding_plan WHERE user_id = ? AND active = 1 ORDER BY time_of_day ASC').all(user.id)) {
    const days = String(plan.days || '').split(',').map((s) => Number(s.trim()));
    if (!days.includes(weekday)) continue;
    const pet = pets.find((p) => p.id === plan.pet_id);
    const doneCount = todayFeedLogs.filter((l) => l.plan_id === plan.id).length;
    plansToday.push({ ...plan, pet_name: pet?.name || '', done: doneCount > 0, log_count: doneCount });
  }

  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const diaryTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const c = db.prepare('SELECT COUNT(*) c FROM diary WHERE user_id = ? AND substr(happened_at,1,10) = ?').get(user.id, d).c;
    diaryTrend.push({ date: d, count: c });
  }

  const stats = {
    pet_count: pets.length,
    diary_total: db.prepare('SELECT COUNT(*) c FROM diary WHERE user_id = ?').get(user.id).c,
    diary_week: db.prepare('SELECT COUNT(*) c FROM diary WHERE user_id = ? AND substr(happened_at,1,10) >= ?').get(user.id, weekAgo).c,
    health_total: db.prepare('SELECT COUNT(*) c FROM health WHERE user_id = ?').get(user.id).c,
    recipe_total: db.prepare('SELECT COUNT(*) c FROM recipe WHERE user_id = ?').get(user.id).c,
    reminder_pending: db.prepare('SELECT COUNT(*) c FROM reminder WHERE user_id = ? AND done = 0').get(user.id).c,
    photo_total: db
      .prepare("SELECT * FROM diary WHERE user_id = ? AND photos IS NOT NULL AND photos != '[]'")
      .all(user.id)
      .reduce((s, r) => s + parseJSON(r.photos, []).length, 0),
    feed_today: todayFeedLogs.length,
  };

  ok(res, { pets, upcoming: upcoming.slice(0, 12), recentDiary, plansToday, diaryTrend, stats, today: t });
}

async function petDetail(req, res, _url, user, id) {
  const pet = ownPet(user.id, id);
  if (!pet) return fail(res, 404, '宠物不存在');
  const weights = db.prepare('SELECT * FROM weight_log WHERE pet_id = ? AND user_id = ? ORDER BY date ASC, id ASC').all(id, user.id);
  const health = db.prepare('SELECT * FROM health WHERE pet_id = ? AND user_id = ? ORDER BY happened_at DESC LIMIT 50').all(id, user.id);
  const diary = db
    .prepare('SELECT * FROM diary WHERE pet_id = ? AND user_id = ? ORDER BY happened_at DESC LIMIT 30')
    .all(id, user.id)
    .map((r) => ({ ...r, photos: parseJSON(r.photos, []) }));
  const feedLogs = db.prepare('SELECT * FROM feeding_log WHERE pet_id = ? AND user_id = ? ORDER BY date DESC, id DESC LIMIT 40').all(id, user.id);
  const plans = db.prepare('SELECT * FROM feeding_plan WHERE pet_id = ? AND user_id = ? ORDER BY time_of_day ASC').all(id, user.id);
  const reminders = db.prepare('SELECT * FROM reminder WHERE pet_id = ? AND user_id = ? ORDER BY done ASC, due_date ASC').all(id, user.id);

  ok(res, {
    pet: petWithMeta(pet),
    weights,
    health,
    diary,
    feedLogs,
    plans,
    reminders,
    stats: {
      diary_count: db.prepare('SELECT COUNT(*) c FROM diary WHERE pet_id = ? AND user_id = ?').get(id, user.id).c,
      health_count: health.length,
      photo_count: diary.reduce((s, r) => s + r.photos.length, 0),
      recipe_count: db.prepare('SELECT COUNT(*) c FROM recipe WHERE user_id = ?').get(user.id).c,
      vaccine_count: health.filter((h) => h.type === '疫苗').length,
      deworm_count: health.filter((h) => h.type === '驱虫').length,
    },
  });
}

async function feedingToday(req, res, url, user) {
  const t = url.searchParams.get('date') || today();
  const weekday = new Date(t).getDay() === 0 ? 7 : new Date(t).getDay();
  const pets = db.prepare('SELECT id, name, avatar, species, weight FROM pets WHERE user_id = ?').all(user.id);
  const plans = db.prepare('SELECT * FROM feeding_plan WHERE user_id = ? AND active = 1 ORDER BY time_of_day ASC').all(user.id);
  const logs = db.prepare('SELECT * FROM feeding_log WHERE user_id = ? AND date = ?').all(user.id, t);

  const schedule = [];
  for (const plan of plans) {
    const days = String(plan.days || '').split(',').map((s) => Number(s.trim()));
    if (!days.includes(weekday)) continue;
    const pet = pets.find((p) => p.id === plan.pet_id);
    const log = logs.find((l) => l.plan_id === plan.id);
    schedule.push({ plan, pet, log: log || null });
  }
  ok(res, { date: t, schedule, logs, pets, totalAmount: logs.reduce((s, l) => s + (Number(l.amount) || 0), 0) });
}

async function feedingComplete(req, res, _url, user) {
  const body = await readJSON(req);
  const planId = Number(body.plan_id);
  const date = body.date || today();
  const plan = db.prepare('SELECT * FROM feeding_plan WHERE id = ? AND user_id = ?').get(planId, user.id);
  if (!plan) return fail(res, 404, '喂食计划不存在');
  const existing = db.prepare('SELECT * FROM feeding_log WHERE plan_id = ? AND user_id = ? AND date = ?').get(planId, user.id, date);
  if (existing) {
    db.prepare('DELETE FROM feeding_log WHERE id = ? AND user_id = ?').run(existing.id, user.id);
    return ok(res, { done: false, id: existing.id });
  }
  const info = db
    .prepare('INSERT INTO feeding_log(user_id, pet_id, plan_id, date, time_of_day, food_name, amount, unit, finished, note, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(user.id, plan.pet_id, plan.id, date, plan.time_of_day, plan.food_name, plan.amount, plan.unit, body.finished === false ? 0 : 1, body.note || '', now());
  ok(res, { done: true, id: Number(info.lastInsertRowid) });
}

async function analyzeRecipeRoute(req, res, _url, user) {
  const body = await readJSON(req);
  let ingredients = body.ingredients;
  if (!Array.isArray(ingredients) && body.recipe_id) {
    const recipe = db.prepare('SELECT * FROM recipe WHERE id = ? AND user_id = ?').get(Number(body.recipe_id), user.id);
    if (!recipe) return fail(res, 404, '配方不存在');
    ingredients = parseJSON(recipe.ingredients, []);
  }
  if (!Array.isArray(ingredients)) return fail(res, 400, '缺少食材列表');
  const analysis = analyzeRecipe(ingredients);
  const weightKg = Number(body.weightKg) || 0;
  const species = body.species || '猫';
  const suggestion = weightKg > 0 ? feedingSuggestion({ weightKg, species, stageKey: body.stageKey, recipePer100Kcal: analysis.per100.kcal }) : null;
  ok(res, { analysis, suggestion, stages: LIFE_STAGES });
}

function ingredientsList(req, res) {
  ok(res, INGREDIENTS);
}

/* ------------------------------ 上传 ------------------------------ */

const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 8) * 1024 * 1024;

async function upload(req, res, _url, user) {
  const boundary = getBoundary(req.headers['content-type'] || '');
  if (!boundary) return fail(res, 400, '缺少 multipart boundary');
  const declared = Number(req.headers['content-length'] || 0);
  if (declared && declared > MAX_UPLOAD + 1024 * 1024) return fail(res, 413, `文件过大，单次上传上限 ${process.env.MAX_UPLOAD_MB || 8}MB`);

  const { files } = await parseMultipart(req, boundary);
  if (!files.length) return fail(res, 400, '没有收到文件');
  const dir = path.join(UPLOAD_DIR, `u${user.id}`);
  fs.mkdirSync(dir, { recursive: true });

  const saved = [];
  for (const file of files.slice(0, 9)) {
    const mime = (file.mime || '').toLowerCase();
    // 只接受常见位图格式（SVG 可内嵌脚本，故不接受）
    if (!EXT_BY_MIME[mime] || mime === 'image/svg+xml') continue;
    if (file.data.length > MAX_UPLOAD) continue;
    const ext = EXT_BY_MIME[mime];
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(dir, name), file.data);
    saved.push({ url: `/uploads/u${user.id}/${name}`, size: file.data.length, field: file.field });
  }
  if (!saved.length) return fail(res, 400, '只支持 JPG / PNG / WebP / GIF 图片');
  ok(res, { files: saved, url: saved[0].url });
}

async function removeUpload(req, res, _url, user) {
  const body = await readJSON(req);
  const url = String(body.url || '');
  const prefix = `/uploads/u${user.id}/`;
  if (!url.startsWith(prefix)) return fail(res, 403, '只能删除自己上传的图片');
  fs.rm(path.join(UPLOAD_DIR, path.basename(path.dirname(url)), path.basename(url)), { force: true }, () => {});
  ok(res, { url });
}

/** 完成提醒：清除或按重复周期顺延 */
async function completeReminder(req, res, _url, user, id) {
  const r = db.prepare('SELECT * FROM reminder WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!r) return fail(res, 404, '提醒不存在');
  if (r.done) {
    db.prepare('UPDATE reminder SET done = 0, done_at = "" WHERE id = ?').run(id);
    return ok(res, db.prepare('SELECT * FROM reminder WHERE id = ?').get(id));
  }
  if (r.repeat_days > 0) {
    let next = new Date(r.due_date);
    const t = new Date(today());
    while (next <= t) next = new Date(next.getTime() + r.repeat_days * 86400000);
    db.prepare('UPDATE reminder SET due_date = ? WHERE id = ?').run(next.toISOString().slice(0, 10), id);
    return ok(res, db.prepare('SELECT * FROM reminder WHERE id = ?').get(id));
  }
  db.prepare('UPDATE reminder SET done = 1, done_at = ? WHERE id = ?').run(now(), id);
  ok(res, db.prepare('SELECT * FROM reminder WHERE id = ?').get(id));
}

/** 相册：聚合当前用户的日记照片 */
function album(req, res, url, user) {
  const petId = url.searchParams.get('pet_id');
  const rows = db
    .prepare(
      `SELECT d.id, d.pet_id, d.happened_at, d.category, d.title, d.photos, p.name AS pet_name
       FROM diary d LEFT JOIN pets p ON p.id = d.pet_id
       WHERE d.user_id = ? AND d.photos IS NOT NULL AND d.photos != '[]' ${petId ? 'AND d.pet_id = ?' : ''}
       ORDER BY d.happened_at DESC`
    )
    .all(...(petId ? [user.id, petId] : [user.id]));
  const photos = [];
  for (const r of rows) {
    for (const url2 of parseJSON(r.photos, [])) {
      photos.push({ url: url2, diary_id: r.id, pet_id: r.pet_id, pet_name: r.pet_name, happened_at: r.happened_at, category: r.category, title: r.title });
    }
  }
  const groups = {};
  for (const p of photos) {
    const key = p.happened_at.slice(0, 7);
    (groups[key] ||= []).push(p);
  }
  ok(res, { photos, groups });
}

/* --------------------------- 数据备份/恢复 --------------------------- */

function exportData(req, res, _url, user) {
  const payload = { app: 'pet-diary', version: 1, exported_at: now(), user: publicUser(user), tables: {} };
  for (const t of USER_TABLES) {
    payload.tables[t] = db.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).all(user.id);
  }
  const buf = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Content-Disposition': `attachment; filename="pet-diary-backup-${today()}.json"`,
  });
  res.end(buf);
}

/**
 * 导入备份：默认清空当前账号的数据后写入（不影响其他账号）。
 * 关键：所有记录都重新分配主键，并重建宠物/计划的外键引用，
 *      绝不使用备份文件里的 id —— 否则 INSERT OR REPLACE 会覆盖其他账号的同 id 记录。
 */
async function importData(req, res, url, user) {
  const body = await readJSON(req);
  const clear = url.searchParams.get('clear') !== '0';
  const tables = body.tables || body;
  if (!tables || typeof tables !== 'object') return fail(res, 400, '备份文件格式不正确');

  // 记录旧照片，导入成功后清理，避免磁盘堆积
  const oldPhotos = [];
  for (const t of ['diary', 'pets', 'recipe']) {
    const col = t === 'recipe' ? 'cover' : t === 'pets' ? 'avatar' : 'photos';
    const rows = db.prepare(`SELECT ${col} AS v FROM ${t} WHERE user_id = ?`).all(user.id);
    for (const r of rows) {
      if (!r.v) continue;
      if (col === 'photos') for (const p of parseJSON(r.v, [])) oldPhotos.push(p);
      else oldPhotos.push(r.v);
    }
  }

  const insertRow = (table, row) => {
    const clean = { ...row, user_id: user.id };
    delete clean.id;
    const cols = Object.keys(clean).filter((c) => clean[c] !== undefined);
    if (!cols.length) return null;
    const info = db
      .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map((c) => (typeof clean[c] === 'boolean' ? (clean[c] ? 1 : 0) : clean[c])));
    return Number(info.lastInsertRowid);
  };

  db.exec('BEGIN');
  try {
    if (clear) {
      // 先删依赖表，再删主表，避免外键顺序问题
      for (const t of ['feeding_log', 'feeding_plan', 'weight_log', 'health', 'diary', 'reminder', 'recipe', 'pets']) {
        db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(user.id);
      }
    }

    const counts = {};
    const petMap = new Map(); // 旧 pet_id -> 新 pet_id
    const planMap = new Map();
    const rowsOf = (t) => (Array.isArray(tables[t]) ? tables[t] : []);
    for (const t of USER_TABLES) counts[t] = 0;

    // 1) 宠物（其余表都依赖它）
    for (const row of rowsOf('pets')) {
      const newId = insertRow('pets', row);
      if (newId && row.id != null) petMap.set(Number(row.id), newId);
      if (newId) counts.pets++;
    }
    // 2) 喂食计划（喂食记录依赖它）
    for (const row of rowsOf('feeding_plan')) {
      const mapped = { ...row, pet_id: remap(row.pet_id, petMap) };
      const newId = insertRow('feeding_plan', mapped);
      if (newId && row.id != null) planMap.set(Number(row.id), newId);
      if (newId) counts.feeding_plan++;
    }
    // 3) 其余表
    for (const t of USER_TABLES) {
      if (t === 'pets' || t === 'feeding_plan') continue;
      for (const row of rowsOf(t)) {
        const mapped = { ...row };
        if ('pet_id' in mapped) mapped.pet_id = remap(mapped.pet_id, petMap);
        if ('plan_id' in mapped && mapped.plan_id != null) mapped.plan_id = remap(mapped.plan_id, planMap);
        if (insertRow(t, mapped)) counts[t]++;
      }
    }

    db.exec('COMMIT');
    for (const p of oldPhotos) {
      if (String(p).startsWith('/uploads/')) fs.rm(path.join(UPLOAD_DIR, path.basename(String(p))), { force: true }, () => {});
    }
    ok(res, { counts, remapped_pets: petMap.size });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** 把备份里的旧外键换成新主键；找不到对应关系时置空，避免写入他人数据 */
function remap(oldId, map) {
  if (oldId === null || oldId === undefined || oldId === '') return null;
  const mapped = map.get(Number(oldId));
  return mapped === undefined ? null : mapped;
}

/* ------------------------------ 路由表 ------------------------------ */

const ROUTES = [
  { method: 'GET', pattern: /^\/api\/auth\/status$/, handler: authStatus, public: true },
  { method: 'POST', pattern: /^\/api\/auth\/register$/, handler: authRegister, public: true },
  { method: 'POST', pattern: /^\/api\/auth\/login$/, handler: authLogin, public: true },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/, handler: authLogout, public: true },
  { method: 'POST', pattern: /^\/api\/auth\/password$/, handler: authPassword },
  { method: 'PUT', pattern: /^\/api\/auth\/profile$/, handler: authProfile },
  { method: 'GET', pattern: /^\/api\/admin\/users$/, handler: adminUsers },
  { method: 'POST', pattern: /^\/api\/admin\/users\/(\d+)\/status$/, handler: adminSetStatus, idIndex: 1 },
  { method: 'GET', pattern: /^\/api\/dashboard$/, handler: dashboard },
  { method: 'GET', pattern: /^\/api\/meta$/, handler: (req, res) => ok(res, { ingredients: INGREDIENTS, stages: LIFE_STAGES, tables: USER_TABLES }) },
  { method: 'GET', pattern: /^\/api\/albums$/, handler: album },
  { method: 'GET', pattern: /^\/api\/feeding\/today$/, handler: feedingToday },
  { method: 'POST', pattern: /^\/api\/feeding\/complete$/, handler: feedingComplete },
  { method: 'POST', pattern: /^\/api\/recipes\/analyze$/, handler: analyzeRecipeRoute },
  { method: 'GET', pattern: /^\/api\/ingredients$/, handler: ingredientsList },
  { method: 'POST', pattern: /^\/api\/upload$/, handler: upload },
  { method: 'POST', pattern: /^\/api\/upload\/delete$/, handler: removeUpload },
  { method: 'GET', pattern: /^\/api\/backup\/export$/, handler: exportData },
  { method: 'POST', pattern: /^\/api\/backup\/import$/, handler: importData },
  { method: 'POST', pattern: /^\/api\/reminders\/(\d+)\/complete$/, handler: completeReminder, idIndex: 1 },
  { method: 'GET', pattern: /^\/api\/pets\/(\d+)\/detail$/, handler: petDetail, idIndex: 1 },
];

const RESOURCES = {
  pets: 'pets',
  diary: 'diary',
  health: 'health',
  weights: 'weight',
  'feeding-plans': 'feedingPlan',
  'feeding-logs': 'feedingLog',
  recipes: 'recipe',
  reminders: 'reminder',
};

const resourceRoutes = Object.entries(RESOURCES).map(([slug, key]) => ({ slug, handlers: crud[key] }));

/** 处理一个 API 请求；返回 true 表示已处理 */
export async function handleApi(req, res, url) {
  const p = url.pathname;

  // 上传的图片（文件名随机，直接静态返回）
  if (p.startsWith('/uploads/')) {
    const rel = p.replace(/^\/uploads\//, '');
    const abs = path.normalize(path.join(UPLOAD_DIR, rel));
    if (!abs.startsWith(UPLOAD_DIR)) {
      fail(res, 403, '越权访问');
      return true;
    }
    serveStatic(res, abs);
    return true;
  }

  if (!p.startsWith('/api/')) return false;

  // 会话解析
  const cookies = parseCookies(req.headers.cookie || '');
  const found = getSession(cookies[cookieName()]);
  const user = found?.user || null;

  for (const route of ROUTES) {
    const m = route.pattern.exec(p);
    if (!m || req.method !== route.method) continue;
    if (!route.public && !user) {
      fail(res, 401, '请先登录');
      return true;
    }
    await route.handler(req, res, url, user, route.idIndex ? m[route.idIndex] : undefined);
    return true;
  }

  for (const { slug, handlers } of resourceRoutes) {
    const base = `/api/${slug}`;
    if (p === base || p === `${base}/`) {
      if (!user) {
        fail(res, 401, '请先登录');
        return true;
      }
      if (req.method === 'GET') {
        await handlers.list(req, res, url, user);
        return true;
      }
      if (req.method === 'POST') {
        await handlers.create(req, res, url, user);
        return true;
      }
      fail(res, 405, '方法不允许');
      return true;
    }
    const m = new RegExp(`^${base}/(\\d+)$`).exec(p);
    if (m) {
      if (!user) {
        fail(res, 401, '请先登录');
        return true;
      }
      const id = m[1];
      if (req.method === 'GET') {
        await handlers.get(req, res, url, id, user);
        return true;
      }
      if (req.method === 'PUT' || req.method === 'PATCH') {
        await handlers.update(req, res, url, id, user);
        return true;
      }
      if (req.method === 'DELETE') {
        await handlers.remove(req, res, url, id, user);
        return true;
      }
      fail(res, 405, '方法不允许');
      return true;
    }
  }

  fail(res, 404, `接口不存在: ${req.method} ${p}`);
  return true;
}

/** 供服务器启动时调用：清理过期会话、按环境变量提升管理员、统计历史遗留数据 */
export function housekeeping() {
  const removed = cleanExpiredSessions();
  if (removed) console.log(`[session] 清理过期会话 ${removed} 条`);

  // ADMIN_USERS="demo,someone" 可把已存在的账号提升为管理员（部署时常用）
  const promote = String(process.env.ADMIN_USERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const name of promote) {
    const u = db.prepare('SELECT id, role FROM users WHERE lower(username) = lower(?)').get(name);
    if (u && u.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id);
      console.log(`[admin] 已将账号「${name}」提升为管理员`);
    }
  }

  const orphans = orphanCount('pets');
  if (orphans) console.log(`[migrate] 检测到 ${orphans} 只未归属账号的宠物，首个注册账号将自动接管`);
}
