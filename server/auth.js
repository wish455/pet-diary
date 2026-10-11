/**
 * 账号与会话：scrypt 口令哈希 + 数据库会话 + Cookie
 * 不依赖任何第三方库。
 */
import crypto from 'node:crypto';
import { db, now } from './db.js';

const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const COOKIE_NAME = 'pd_session';

/* ----------------------------- 口令哈希 ----------------------------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const calc = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
    const expected = Buffer.from(hash, 'hex');
    return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
  } catch {
    return false;
  }
}

/* ----------------------------- 会话 ----------------------------- */

export function createSession(userId, { userAgent = '', ip = '' } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 86400000);
  db.prepare('INSERT INTO sessions(token, user_id, created_at, expires_at, last_seen, user_agent, ip) VALUES(?,?,?,?,?,?,?)')
    .run(token, userId, created.toISOString(), expires.toISOString(), created.toISOString(), String(userAgent).slice(0, 300), String(ip).slice(0, 60));
  return { token, expires };
}

export function getSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (!user || user.status !== 'active') return null;
  db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').run(now(), token);
  return { session: row, user };
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function destroyUserSessions(userId, exceptToken = null) {
  if (exceptToken) db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, exceptToken);
  else db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function cleanExpiredSessions() {
  const info = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  return Number(info.changes || 0);
}

/* ----------------------------- Cookie ----------------------------- */

export function cookieName() {
  return COOKIE_NAME;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** 是否要求 HTTPS Cookie（生产环境由平台提供 HTTPS 时自动开启） */
function cookieSecure() {
  const v = process.env.COOKIE_SECURE;
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export function sessionCookie(token, expires) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`,
  ];
  if (cookieSecure()) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie() {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (cookieSecure()) parts.push('Secure');
  return parts.join('; ');
}

/* ----------------------------- 用户 ----------------------------- */

export const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5-]{2,20}$/;

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname || user.username,
    email: user.email || '',
    avatar: user.avatar || '',
    role: user.role,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  };
}

export function findUserByName(username) {
  return db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(String(username || '').trim());
}

export function countUsers() {
  return db.prepare('SELECT COUNT(*) c FROM users').get().c;
}

export function createUser({ username, password, nickname = '', email = '', role = 'user' }) {
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) throw new Error('用户名需 2–20 位，仅支持中英文、数字、下划线或短横线');
  if (String(password || '').length < 8) throw new Error('密码至少 8 位');
  if (findUserByName(name)) throw new Error('该用户名已被注册');
  const info = db
    .prepare('INSERT INTO users(username, nickname, email, password_hash, role, status, created_at) VALUES(?,?,?,?,?,?,?)')
    .run(name, nickname || name, email || '', hashPassword(password), role, 'active', now());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
}

export function updatePassword(userId, newPassword) {
  if (String(newPassword || '').length < 8) throw new Error('新密码至少 8 位');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
}

export function verifyUserPassword(userId, password) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return !!user && verifyPassword(password, user.password_hash);
}

/* --------------------------- 注册开关 / 邀请码 --------------------------- */

export function registrationOpen() {
  const v = process.env.OPEN_REGISTRATION;
  if (v === '0' || v === 'false') return false;
  return true;
}

export function inviteCode() {
  return String(process.env.INVITE_CODE || '').trim();
}

export function assignAvatar(userId, nickname) {
  const ch = String(nickname || '宠').trim().slice(0, 1) || '宠';
  const hue = [...String(userId) + ch].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${hue},85%,72%)"/><stop offset="100%" stop-color="hsl(${(hue + 48) % 360},85%,62%)"/></linearGradient></defs><rect width="160" height="160" rx="46" fill="url(#g)"/><text x="80" y="104" font-size="76" text-anchor="middle" fill="#fff" font-family="sans-serif">${ch.replace(/[<>&]/g, '')}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/* ----------------------------- 登录限流 ----------------------------- */

const attempts = new Map(); // key -> { count, firstAt, blockedUntil }
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 10 * 60 * 1000;

export function rateLimit(key) {
  const k = String(key);
  const rec = attempts.get(k) || { count: 0, firstAt: Date.now(), blockedUntil: 0 };
  if (rec.blockedUntil && rec.blockedUntil > Date.now()) {
    return { blocked: true, retryAfter: Math.ceil((rec.blockedUntil - Date.now()) / 1000) };
  }
  if (Date.now() - rec.firstAt > WINDOW_MS) {
    rec.count = 0;
    rec.firstAt = Date.now();
    rec.blockedUntil = 0;
  }
  attempts.set(k, rec);
  return { blocked: false, retryAfter: 0 };
}

export function recordFailure(key) {
  const k = String(key);
  const rec = attempts.get(k) || { count: 0, firstAt: Date.now(), blockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.blockedUntil = Date.now() + BLOCK_MS;
    rec.count = 0;
  }
  attempts.set(k, rec);
}

export function clearFailures(key) {
  attempts.delete(String(key));
}
