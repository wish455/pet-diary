/** HTTP 小工具：请求体读取、JSON 响应、静态文件、multipart 上传解析 */
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function sendJSON(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload ?? null), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function ok(res, data) {
  sendJSON(res, 200, { ok: true, data });
}

export function fail(res, status, message) {
  sendJSON(res, status, { ok: false, error: message });
}

export function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJSON(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

export function serveStatic(res, filePath, { download = false } = {}) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
    };
    if (ext === '.html') headers['Cache-Control'] = 'no-cache';
    else if (filePath.includes(`${path.sep}uploads${path.sep}`)) headers['Cache-Control'] = 'public, max-age=31536000';
    else headers['Cache-Control'] = 'no-cache';
    if (download) headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function parseContentDisposition(value = '') {
  const out = {};
  for (const part of value.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rest.length) continue;
    const key = rawKey.trim().toLowerCase();
    let val = rest.join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

/**
 * 极简 multipart/form-data 解析（够用且无依赖）：
 * 返回 { fields: {name: string}, files: [{field, filename, mime, data: Buffer}] }
 */
export function parseMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const delim = Buffer.from(`--${boundary}`);
      const fields = {};
      const files = [];
      let pos = buf.indexOf(delim);
      if (pos < 0) return resolve({ fields, files });
      pos += delim.length;
      while (pos < buf.length) {
        // 结束标记 --
        if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break;
        // 跳过 CRLF
        if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2;
        const headEnd = buf.indexOf('\r\n\r\n', pos);
        if (headEnd < 0) break;
        const headerText = buf.toString('utf8', pos, headEnd);
        const bodyStart = headEnd + 4;
        let next = buf.indexOf(delim, bodyStart);
        if (next < 0) next = buf.length;
        let bodyEnd = next;
        // 去掉分隔符前的 CRLF
        if (buf[bodyEnd - 2] === 0x0d && buf[bodyEnd - 1] === 0x0a) bodyEnd -= 2;
        const headers = {};
        for (const line of headerText.split('\r\n')) {
          const idx = line.indexOf(':');
          if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
        }
        const cd = parseContentDisposition(headers['content-disposition']);
        const data = buf.subarray(bodyStart, bodyEnd);
        if (cd.filename) {
          files.push({ field: cd.name, filename: cd.filename, mime: headers['content-type'] || '', data: Buffer.from(data) });
        } else if (cd.name) {
          fields[cd.name] = data.toString('utf8');
        }
        pos = next + delim.length;
      }
      resolve({ fields, files });
    });
  });
}

export function getBoundary(contentType = '') {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return m ? (m[1] || m[2]).trim() : null;
}

export const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};
