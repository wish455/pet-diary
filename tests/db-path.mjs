/** 供自检脚本定位数据库文件（与 server/db.js 使用同一套路径规则） */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function dbFile() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
  return path.join(dir, 'pet.db');
}
