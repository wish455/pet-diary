/** 服务器入口：静态文件 + REST API + 上传目录 + 安全响应头 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DATA_DIR } from './db.js';
import { handleApi, housekeeping } from './api.js';
import { fail } from './http-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
// 平台部署（Render/Fly/Railway/容器）需要监听 0.0.0.0；本机默认只监听回环地址
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' || process.env.PUBLIC_HOST === '1' ? '0.0.0.0' : '127.0.0.1');
const MAX_BODY = Number(process.env.MAX_UPLOAD_MB || 8) * 1024 * 1024 + 2 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
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
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // 纯自托管：脚本/样式/图片全部同源，禁止内联脚本与外部资源
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"
  );
  if (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

function serveFile(res, filePath, { spa = false } = {}) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      if (spa) return serveFile(res, path.join(ROOT, 'index.html'));
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const isUpload = filePath.includes(`${path.sep}uploads${path.sep}`);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isUpload ? 'public, max-age=604800' : 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    securityHeaders(res);

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, uptime: Math.round(process.uptime()), data_dir: DATA_DIR }));
      return;
    }

    /**
     * 仅用于自动化截图的调试通道，默认完全关闭：
     * 只有设置了环境变量 SHOT_TOKEN 且请求携带相同令牌时才生效。
     * 用途：把一个已有会话注入浏览器，从而截取「登录后」的界面。
     */
    if (url.pathname === '/__shot' && process.env.SHOT_TOKEN && url.searchParams.get('t') === process.env.SHOT_TOKEN) {
      const rawCookie = url.searchParams.get('c') || '';
      const headers = [];
      if (rawCookie) headers.push(['Set-Cookie', `${rawCookie}; Path=/; HttpOnly; SameSite=Lax`]);
      headers.push(['Location', url.searchParams.get('to') || '/']);
      res.writeHead(302, Object.fromEntries(headers));
      res.end();
      return;
    }

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }

    const handled = await handleApi(req, res, url);
    if (handled) return;

    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, '方法不允许');

    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const target = path.normalize(path.join(ROOT, rel));
    if (!target.startsWith(ROOT)) return fail(res, 403, '越权访问');
    if (path.extname(target)) return serveFile(res, target, { spa: true });
    return serveFile(res, path.join(ROOT, 'index.html'));
  } catch (err) {
    const msg = String(err?.message || '服务器内部错误');
    const isDataError = err?.code === 'ERR_SQLITE_ERROR';
    const friendly = isDataError
      ? /NOT NULL constraint failed: (\w+)\.(\w+)/.exec(msg)
        ? `缺少必填字段：${/NOT NULL constraint failed: (\w+)\.(\w+)/.exec(msg)[2]}`
        : /UNIQUE constraint/.test(msg)
          ? '数据重复，违反唯一约束'
          : `数据校验失败：${msg}`
      : msg;
    if (!isDataError) console.error('[error]', err);
    if (!res.headersSent) fail(res, isDataError ? 400 : 500, friendly);
    else res.end();
  }
});

// 请求体上限（上传大图时给出明确提示，而不是直接断开）
server.on('request', (req, res) => {
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) {
      if (!res.headersSent) fail(res, 413, `请求体过大，单次上传上限 ${process.env.MAX_UPLOAD_MB || 8}MB`);
      req.destroy();
    }
  });
});

function listen(port, attempt = 0) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 10 && !process.env.PORT) {
      console.warn(`端口 ${port} 被占用，尝试 ${port + 1} ...`);
      listen(port + 1, attempt + 1);
    } else {
      console.error('启动失败：', err.message);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    // 控制台横幅统一用 ASCII，避免在 GBK 代码页下显示成乱码（网页界面中文不受影响）
    const shown = HOST === '0.0.0.0' ? `http://<本机IP>:${port}` : `http://${HOST}:${port}`;
    console.log('');
    console.log('  ================================================');
    console.log('   Pet Diary - 宠物管理系统  (running)');
    console.log(`   Listen          : ${HOST}:${port}`);
    console.log(`   Open in browser : ${shown}`);
    console.log(`   Database file   : ${path.join(DATA_DIR, 'pet.db')}`);
    console.log(`   Registration    : ${process.env.OPEN_REGISTRATION === '0' ? 'closed' : 'open'}${process.env.INVITE_CODE ? ' (invite code required)' : ''}`);
    console.log('   Stop server     : Ctrl + C');
    console.log('  ================================================');
    console.log('');
    housekeeping();
  });
}

/** 优雅关闭：容器编排发送 SIGTERM 时先停止接收新请求 */
function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭服务...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

listen(PORT);
