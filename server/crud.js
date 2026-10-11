/**
 * 通用 CRUD 路由工厂：统一处理列表 / 详情 / 新增 / 修改 / 删除、
 * JSON 字段、时间戳，以及「按登录用户隔离数据」。
 */
import { db, now, parseJSON, removeUploadFile } from './db.js';
import { ok, fail, readJSON } from './http-utils.js';

/**
 * @param {object} cfg
 * @param {string} cfg.table
 * @param {string[]} cfg.fields           可写字段
 * @param {string[]} [cfg.jsonFields]     需要 JSON 序列化的字段
 * @param {string} [cfg.defaultOrder]     默认排序 SQL 片段
 * @param {string[]} [cfg.filterable]     支持 ?field=value 精确过滤的字段
 * @param {string} [cfg.petField]         指向 pets 表的外键字段（用于校验宠物归属）
 * @param {(row:any, action:string, body:any, user:any)=>void} [cfg.afterWrite]
 * @param {(row:any, user:any)=>void} [cfg.beforeDelete]
 */
export function crudRoutes(cfg) {
  const {
    table,
    fields,
    jsonFields = [],
    defaultOrder = 'id DESC',
    filterable = [],
    petField = null,
    mapRow,
    afterWrite,
    beforeDelete,
  } = cfg;

  const serialize = (body) => {
    const row = {};
    for (const f of fields) {
      if (!(f in body)) continue;
      let v = body[f];
      if (jsonFields.includes(f)) v = JSON.stringify(v ?? null);
      if (typeof v === 'boolean') v = v ? 1 : 0;
      if (v === undefined) v = null;
      row[f] = v;
    }
    return row;
  };

  const hydrate = (row) => {
    if (!row) return row;
    const out = { ...row };
    for (const f of jsonFields) out[f] = parseJSON(out[f], []);
    return mapRow ? mapRow(out) : out;
  };

  /** 校验宠物确实属于当前用户，防止越权写入他人宠物 */
  const checkPet = (petId, user, res) => {
    if (!petField) return true;
    if (petId === null || petId === undefined || petId === '') return true;
    const pet = db.prepare('SELECT id, user_id FROM pets WHERE id = ?').get(petId);
    if (!pet || (pet.user_id != null && pet.user_id !== user.id)) {
      fail(res, 404, '宠物不存在或不属于当前账号');
      return false;
    }
    return true;
  };

  return {
    async list(req, res, url, user) {
      const where = ['user_id = ?'];
      const params = [user.id];
      for (const f of filterable) {
        const v = url.searchParams.get(f);
        if (v === null || v === '') continue;
        where.push(`${f} = ?`);
        params.push(v);
      }
      const q = url.searchParams.get('q');
      if (q) {
        const textCols = fields.filter((f) => !jsonFields.includes(f));
        where.push(`(${textCols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
        for (let i = 0; i < textCols.length; i++) params.push(`%${q}%`);
      }
      const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 2000);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
      const clause = `WHERE ${where.join(' AND ')}`;
      const rows = db.prepare(`SELECT * FROM ${table} ${clause} ORDER BY ${defaultOrder} LIMIT ? OFFSET ?`).all(...params, limit, offset).map(hydrate);
      const total = db.prepare(`SELECT COUNT(*) c FROM ${table} ${clause}`).get(...params).c;
      ok(res, { items: rows, total });
    },

    async get(req, res, _url, id, user) {
      const row = hydrate(db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(id, user.id));
      if (!row) return fail(res, 404, '记录不存在');
      ok(res, row);
    },

    async create(req, res, _url, user) {
      const body = await readJSON(req);
      const row = serialize(body);
      if (!Object.keys(row).length) return fail(res, 400, '没有可保存的字段');
      if (petField && !checkPet(row[petField], user, res)) return;
      row.user_id = user.id;
      if (fields.includes('created_at')) row.created_at = now();
      if (fields.includes('updated_at')) row.updated_at = now();
      const cols = Object.keys(row);
      const info = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c]));
      const created = hydrate(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
      afterWrite?.(created, 'create', body, user);
      ok(res, created);
    },

    async update(req, res, _url, id, user) {
      const exists = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(id, user.id);
      if (!exists) return fail(res, 404, '记录不存在');
      const body = await readJSON(req);
      const row = serialize(body);
      if (petField && 'pet_id' in row && !checkPet(row.pet_id, user, res)) return;
      if (fields.includes('updated_at')) row.updated_at = now();
      const cols = Object.keys(row);
      if (!cols.length) return ok(res, hydrate(exists));
      db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND user_id = ?`)
        .run(...cols.map((c) => row[c]), id, user.id);
      const updated = hydrate(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
      afterWrite?.(updated, 'update', body, user);
      ok(res, updated);
    },

    async remove(req, res, _url, id, user) {
      const exists = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(id, user.id);
      if (!exists) return fail(res, 404, '记录不存在');
      beforeDelete?.(exists, user);
      db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(id, user.id);
      if (exists.avatar) removeUploadFile(exists.avatar);
      if (exists.cover) removeUploadFile(exists.cover);
      for (const photo of parseJSON(exists.photos, [])) removeUploadFile(photo);
      ok(res, { id: Number(id) });
    },
  };
}
