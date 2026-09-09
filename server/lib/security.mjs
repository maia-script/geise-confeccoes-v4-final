import crypto from 'node:crypto';

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function hashPassword(password) {
  const normalized = String(password || '');
  if (normalized.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(normalized, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [kind, saltText, hashText] = String(stored).split('$');
    if (kind !== 'scrypt' || !saltText || !hashText) return false;
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    const actual = crypto.scryptSync(String(password || ''), salt, expected.length, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function makeId(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function futureIso(hours) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function sanitizeText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (base, factor) => {
    let sum = 0;
    for (const ch of base) sum += Number(ch) * factor--;
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  const d1 = digit(cpf.slice(0, 9), 10);
  const d2 = digit(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}


export function sanitizePublicUrl(value,{allowRelative=true,allowHttp=false}={}) {
  const raw=String(value||'').trim().slice(0,1000);
  if(!raw)return '';
  if(allowRelative && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url=new URL(raw);
    if(url.protocol==='https:' || (allowHttp && url.protocol==='http:')) return url.href;
  } catch {}
  return '';
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = decodeURIComponent(part.slice(0, idx).trim());
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) out[key] = value;
  }
  return out;
}

export function sessionCookie(token, { secure = false, maxAgeSeconds = 604800 } = {}) {
  return `geise_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie({ secure = false } = {}) {
  return `geise_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
