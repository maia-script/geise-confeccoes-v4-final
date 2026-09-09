import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.mjs';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8'
};

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "img-src 'self' data: https:", "style-src 'self' 'unsafe-inline'", "script-src 'self'",
    "connect-src 'self'", "font-src 'self' data:",
    "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'"
  ].join('; '));
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export function json(res, status, data, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

export function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(body);
}

export function hasPathTraversal(rawUrl = '') {
  let raw = String(rawUrl || '/').split(/[?#]/, 1)[0];
  for (let i = 0; i < 3; i++) {
    let decoded;
    try { decoded = decodeURIComponent(raw); }
    catch { return true; }
    if (decoded === raw) break;
    raw = decoded;
  }
  if (raw.includes('\u0000')) return true;
  const normalizedSeparators = raw.replace(/\\/g, '/');
  return normalizedSeparators.split('/').some(segment => segment === '..');
}

export async function readJson(req, maxBytes = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Payload muito grande.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch {
    const error = new Error('JSON inválido.'); error.status = 400; throw error;
  }
}

export function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const normalized = path.normalize(requested).replace(/^([.][.][/\\])+/, '');
  const file = path.resolve(config.publicDir, `.${normalized.startsWith('/') ? normalized : `/${normalized}`}`);
  const relative = path.relative(config.publicDir, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    if (/\.(?:css|js|mjs|svg|png|webp|avif)$/.test(ext)) res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    else res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file).pipe(res);
    return true;
  } catch { return false; }
}

export function serveSpa(res) {
  const file = path.join(config.publicDir, 'index.html');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(file).pipe(res);
}

export function requestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(forwarded ? String(forwarded).split(',')[0] : req.socket.remoteAddress || '').trim();
}

const buckets = new Map();
let lastBucketSweep = 0;
function sweepRateLimitBuckets(now) {
  if (now - lastBucketSweep < 5 * 60_000 && buckets.size < 5000) return;
  lastBucketSweep = now;
  for (const [id, bucket] of buckets) if (bucket.reset <= now) buckets.delete(id);
}
export function rateLimit(req, res, { key = 'global', limit = 120, windowMs = 60_000 } = {}) {
  const id = `${key}:${requestIp(req)}`;
  const now = Date.now();
  sweepRateLimitBuckets(now);
  const current = buckets.get(id);
  if (!current || current.reset <= now) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return true;
  }
  current.count += 1;
  if (current.count > limit) {
    res.setHeader('Retry-After', Math.ceil((current.reset - now) / 1000));
    json(res, 429, { error: 'Muitas solicitações. Tente novamente em instantes.' });
    return false;
  }
  return true;
}
