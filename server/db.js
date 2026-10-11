/**
 * 数据库层：使用 Node 内置 node:sqlite（Node >= 22.5），零第三方依赖。
 * 数据文件：data/pet.db
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
/** 数据目录可用 DATA_DIR 环境变量指定（容器/平台部署时挂载持久磁盘） */
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_FILE = path.join(DATA_DIR, 'pet.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_FILE);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  nickname      TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  password_hash TEXT NOT NULL,                   -- scrypt: salt:hash
  avatar        TEXT DEFAULT '',
  role          TEXT DEFAULT 'user',             -- admin / user
  status        TEXT DEFAULT 'active',           -- active / disabled
  last_login_at TEXT DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  last_seen   TEXT,
  user_agent  TEXT DEFAULT '',
  ip          TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  value    TEXT,
  PRIMARY KEY (user_id, key)
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS pets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  species       TEXT NOT NULL DEFAULT '猫',      -- 猫 / 狗 / 其他
  breed         TEXT DEFAULT '',
  gender        TEXT DEFAULT '未知',              -- 公 / 母 / 未知
  birthday      TEXT DEFAULT '',
  adopt_date    TEXT DEFAULT '',
  weight        REAL,                             -- 当前体重 kg
  color         TEXT DEFAULT '',
  chip_no       TEXT DEFAULT '',
  sterilized    INTEGER DEFAULT 0,                -- 是否绝育
  status        TEXT DEFAULT '在身边',            -- 在身边 / 已送养 / 已离开
  avatar        TEXT DEFAULT '',
  note          TEXT DEFAULT '',
  sort          INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diary (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  pet_id        INTEGER REFERENCES pets(id) ON DELETE CASCADE,
  happened_at   TEXT NOT NULL,                    -- ISO datetime
  category      TEXT NOT NULL DEFAULT '日常',      -- 喂食/便便/遛弯/玩耍/洗澡/训练/心情/就医/其他
  mood          TEXT DEFAULT '',                  -- 开心/平常/不适/兴奋/焦虑
  title         TEXT DEFAULT '',
  content       TEXT DEFAULT '',
  photos        TEXT DEFAULT '[]',                -- JSON 数组：/uploads/xxx.jpg
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diary_time ON diary(happened_at DESC);

CREATE TABLE IF NOT EXISTS health (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  pet_id        INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT '疫苗',      -- 疫苗/驱虫/就诊/用药/体检/手术/其他
  name          TEXT DEFAULT '',
  happened_at   TEXT NOT NULL,
  next_due      TEXT DEFAULT '',                  -- 下次到期日（用于提醒）
  hospital      TEXT DEFAULT '',
  doctor        TEXT DEFAULT '',
  cost          REAL DEFAULT 0,
  weight        REAL,                             -- 就诊时体重
  result        TEXT DEFAULT '',                  -- 结论 / 诊断
  note          TEXT DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_health_pet ON health(pet_id, happened_at DESC);

CREATE TABLE IF NOT EXISTS weight_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  pet_id        INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,                    -- YYYY-MM-DD
  weight        REAL NOT NULL,
  note          TEXT DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weight_pet ON weight_log(pet_id, date);

CREATE TABLE IF NOT EXISTS feeding_plan (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  pet_id        INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  time_of_day   TEXT NOT NULL DEFAULT '08:00',
  food_name     TEXT NOT NULL,
  food_type     TEXT DEFAULT '主粮',              -- 主粮/罐头/冻干/生骨肉/自制/零食/保健品
  amount        REAL DEFAULT 0,
  unit          TEXT DEFAULT 'g',
  days          TEXT DEFAULT '1,2,3,4,5,6,7',     -- 周几重复
  active        INTEGER DEFAULT 1,
  note          TEXT DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feeding_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  pet_id        INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  plan_id       INTEGER REFERENCES feeding_plan(id) ON DELETE SET NULL,
  date          TEXT NOT NULL,                    -- YYYY-MM-DD
  time_of_day   TEXT DEFAULT '',
  food_name     TEXT DEFAULT '',
  amount        REAL DEFAULT 0,
  unit          TEXT DEFAULT 'g',
  finished      INTEGER DEFAULT 1,                -- 是否吃完
  note          TEXT DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedlog ON feeding_log(pet_id, date DESC);

CREATE TABLE IF NOT EXISTS recipe (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  for_pet       TEXT DEFAULT '猫',                -- 猫 / 狗 / 猫狗通用
  category      TEXT DEFAULT '主食',              -- 主食/加餐/零食/汤饮/营养补充
  ingredients   TEXT DEFAULT '[]',                -- JSON: [{name, amount, unit, kcal100, note}]
  steps         TEXT DEFAULT '',
  tips          TEXT DEFAULT '',
  cover         TEXT DEFAULT '',
  batch_weight  REAL DEFAULT 0,                   -- 成品总重 g
  is_public     INTEGER DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminder (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  pet_id        INTEGER REFERENCES pets(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  type          TEXT DEFAULT '其他',              -- 疫苗/驱虫/洗澡/剪指甲/复诊/喂药/生日/其他
  due_date      TEXT NOT NULL,
  repeat_days   INTEGER DEFAULT 0,                -- 0=不重复，>0 每 N 天重复
  done          INTEGER DEFAULT 0,
  done_at       TEXT DEFAULT '',
  note          TEXT DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminder_due ON reminder(done, due_date);

CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT
);
`);

export const now = () => new Date().toISOString();

/* ------------------------- 版本迁移 ------------------------- */

/** 所有归属到用户的数据表（用于备份与迁移） */
export const USER_TABLES = ['pets', 'diary', 'health', 'weight_log', 'feeding_plan', 'feeding_log', 'recipe', 'reminder'];

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

/**
 * 为早期版本创建的数据库补齐多用户字段。
 * 幂等：已存在则跳过。
 */
export function migrate() {
  let changed = 0;
  for (const table of USER_TABLES) {
    if (!hasColumn(table, 'user_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`);
      changed++;
    }
  }
  for (const table of USER_TABLES) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_user ON ${table}(user_id)`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)');
  if (changed) console.log(`[migrate] 已为 ${changed} 张数据表添加 user_id 字段（多用户模式）`);
  return changed;
}

migrate();

/** 早期版本遗留的、没有归属用户的数据（首次注册的账号会自动接管） */
export function orphanCount(table = 'pets') {
  return db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE user_id IS NULL`).get().c;
}

export function adoptOrphans(userId) {
  let total = 0;
  for (const table of USER_TABLES) {
    const info = db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId);
    total += Number(info.changes || 0);
  }
  return total;
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

/** 删除宠物时清理其上传文件（数据库外键负责行级级联） */
export function removeUploadFile(relPath) {
  if (!relPath || !relPath.startsWith('/uploads/')) return;
  const abs = path.join(UPLOAD_DIR, path.basename(relPath));
  fs.rm(abs, { force: true }, () => {});
}

/** 简易 JSON 容错解析 */
export function parseJSON(text, fallback) {
  if (text == null || text === '') return fallback;
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
