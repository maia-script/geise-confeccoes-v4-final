import { dbAll, dbGet, dbRun, jsonValue } from '../db/index.mjs';
import { config } from '../config.mjs';
import { clearSessionCookie, futureIso, hashPassword, hashToken, isValidEmail, makeId, normalizeEmail, nowIso, parseCookies, randomToken, sessionCookie, verifyPassword } from '../lib/security.mjs';
import { enqueueNotification } from './notifications.mjs';

const SYNTHETIC_DOMAIN = '@cliente.lojageise.invalid';

export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return '';
  return digits;
}

function syntheticEmail(phone) { return `cliente+${phone}${SYNTHETIC_DOMAIN}`; }
function isSyntheticEmail(email) { return String(email||'').endsWith(SYNTHETIC_DOMAIN); }

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: isSyntheticEmail(row.email) ? '' : row.email,
    role: row.role,
    phone: row.phone || '',
    permissions: jsonValue(row.permissions_json, row.role === 'admin' ? ['*'] : []),
    marketingOptIn: Boolean(row.marketing_opt_in),
    emailVerified: isSyntheticEmail(row.email) ? false : Boolean(row.email_verified_at),
    createdAt: row.created_at
  };
}

export async function registerUser({ name, phone, password, email = '', marketingOptIn = false }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = email ? normalizeEmail(email) : '';
  if (!String(name || '').trim()) throw Object.assign(new Error('Informe seu nome.'), { status: 400 });
  if (!normalizedPhone) throw Object.assign(new Error('Digite um telefone válido com DDD.'), { status: 400 });
  if (normalizedEmail && !isValidEmail(normalizedEmail)) throw Object.assign(new Error('Digite um e-mail válido ou deixe o campo vazio.'), { status: 400 });
  if (String(password || '').length < 8) throw Object.assign(new Error('A senha precisa ter pelo menos 8 caracteres.'), { status: 400 });
  if (await dbGet('SELECT id FROM users WHERE phone=?',[normalizedPhone])) throw Object.assign(new Error('Já existe uma conta com este telefone.'), { status: 409 });
  if (normalizedEmail && await dbGet('SELECT id FROM users WHERE LOWER(email)=LOWER(?)',[normalizedEmail])) throw Object.assign(new Error('Já existe uma conta com este e-mail.'), { status: 409 });

  const now = nowIso();
  const id = makeId('usr_');
  const storedEmail = normalizedEmail || syntheticEmail(normalizedPhone);
  await dbRun(`INSERT INTO users (id,name,email,password_hash,role,permissions_json,phone,marketing_opt_in,created_at,updated_at) VALUES (?,?,?,?, 'customer','[]',?,?,?,?)`,[
    id, String(name).trim().slice(0,120), storedEmail, hashPassword(password), normalizedPhone, marketingOptIn ? 1 : 0, now, now
  ]);
  const user = publicUser(await dbGet('SELECT * FROM users WHERE id=?',[id]));
  if (normalizedEmail) await createEmailVerification(id, normalizedEmail);
  return user;
}

export async function authenticate(identifier, password) {
  const raw = String(identifier || '').trim();
  const phone = normalizePhone(raw);
  const row = phone
    ? await dbGet('SELECT * FROM users WHERE phone=?',[phone])
    : await dbGet('SELECT * FROM users WHERE LOWER(email)=LOWER(?)',[normalizeEmail(raw)]);
  if (!row || !verifyPassword(password, row.password_hash)) throw Object.assign(new Error('Telefone/e-mail ou senha incorretos.'), { status: 401 });
  return publicUser(row);
}

export async function createSession(userId) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = nowIso();
  await dbRun(`INSERT INTO sessions (id,token_hash,user_id,csrf_token,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?,?)`,[makeId('ses_'), hashToken(token), userId, csrf, futureIso(config.sessionTtlHours), now, now]);
  return { token, csrf, cookie: sessionCookie(token, { secure: config.isProd, maxAgeSeconds: config.sessionTtlHours * 3600 }) };
}

export async function sessionFromRequest(req) {
  const token = parseCookies(req.headers.cookie || '').geise_session;
  if (!token) return null;
  const row = await dbGet(`SELECT s.*,u.name,u.email,u.role,u.phone,u.permissions_json,u.marketing_opt_in,u.email_verified_at,u.created_at AS user_created_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,[hashToken(token), nowIso()]);
  if (!row) return null;
  await dbRun('UPDATE sessions SET last_seen_at=? WHERE id=?',[nowIso(), row.id]);
  return {
    sessionId: row.id,
    csrf: row.csrf_token,
    user: publicUser({
      id:row.user_id,name:row.name,email:row.email,role:row.role,phone:row.phone,permissions_json:row.permissions_json,
      marketing_opt_in:row.marketing_opt_in,email_verified_at:row.email_verified_at,created_at:row.user_created_at
    })
  };
}

export async function requireSession(req) {
  const session = await sessionFromRequest(req);
  if (!session) throw Object.assign(new Error('Faça login para continuar.'), { status: 401 });
  return session;
}

export async function requireAdmin(req) {
  const session = await requireSession(req);
  if (!['admin','staff'].includes(session.user.role)) throw Object.assign(new Error('Acesso administrativo necessário.'), { status: 403 });
  return session;
}

export async function requireOwner(req) {
  const session = await requireSession(req);
  if (session.user.role !== 'admin') throw Object.assign(new Error('Esta ação exige acesso de administrador principal.'), { status: 403 });
  return session;
}

export function requireCsrf(req, session) {
  const token = String(req.headers['x-csrf-token'] || '');
  if (!token || token !== session.csrf) throw Object.assign(new Error('Token de segurança inválido. Atualize a página e tente novamente.'), { status: 403 });
}

export async function destroySession(req) {
  const token = parseCookies(req.headers.cookie || '').geise_session;
  if (token) await dbRun('DELETE FROM sessions WHERE token_hash=?',[hashToken(token)]);
  return clearSessionCookie({ secure: config.isProd });
}

export async function requestPasswordReset(identifier) {
  const raw = String(identifier||'').trim();
  const phone = normalizePhone(raw);
  if (phone) {
    // Resposta deliberadamente genérica para não revelar se o telefone possui conta.
    return { ok:true, channel:'whatsapp' };
  }
  const normalized = normalizeEmail(raw);
  if (!isValidEmail(normalized)) return { ok:true, channel:'whatsapp' };
  const user = await dbGet('SELECT id,email FROM users WHERE LOWER(email)=LOWER(?)',[normalized]);
  if (!user) return { ok:true, channel:'email' };
  const token = randomToken(32);
  const now = nowIso();
  await dbRun('DELETE FROM password_reset_tokens WHERE user_id=? OR expires_at<?',[user.id, now]);
  await dbRun('INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)',[makeId('rst_'), user.id, hashToken(token), futureIso(1), now]);
  await enqueueNotification({userId:user.id,channel:'email',template:'password_reset',recipient:user.email,payload:{token}});
  return { ok: true, channel:'email', ...(config.isProd ? {} : { developmentToken: token }) };
}

export async function resetPassword(token, password) {
  if (String(password || '').length < 8) throw Object.assign(new Error('A senha precisa ter pelo menos 8 caracteres.'), { status: 400 });
  const row = await dbGet('SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?',[hashToken(token), nowIso()]);
  if (!row) throw Object.assign(new Error('Link de recuperação inválido ou expirado.'), { status: 400 });
  const now = nowIso();
  await dbRun('UPDATE users SET password_hash=?,updated_at=? WHERE id=?',[hashPassword(password), now, row.user_id]);
  await dbRun('UPDATE password_reset_tokens SET used_at=? WHERE id=?',[now, row.id]);
  await dbRun('DELETE FROM sessions WHERE user_id=?',[row.user_id]);
  return { ok: true };
}

export async function updateProfile(userId, patch) {
  const current = await dbGet('SELECT * FROM users WHERE id=?',[userId]);
  if (!current) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  const name = String(patch.name ?? current.name).trim().slice(0,120);
  const phone = normalizePhone(patch.phone ?? current.phone ?? '');
  if (!name) throw Object.assign(new Error('Informe seu nome.'), { status: 400 });
  if (!phone) throw Object.assign(new Error('Informe um telefone válido.'), { status: 400 });
  const conflict = await dbGet('SELECT id FROM users WHERE phone=? AND id<>?',[phone,userId]);
  if (conflict) throw Object.assign(new Error('Este telefone já está em uso por outra conta.'), { status: 409 });
  const marketing = patch.marketingOptIn === undefined ? current.marketing_opt_in : (patch.marketingOptIn ? 1 : 0);
  await dbRun('UPDATE users SET name=?,phone=?,marketing_opt_in=?,updated_at=? WHERE id=?',[name, phone, marketing, nowIso(), userId]);
  return publicUser(await dbGet('SELECT * FROM users WHERE id=?',[userId]));
}

export async function createEmailVerification(userId,email){
  const raw=randomToken(28),now=nowIso();
  await dbRun('DELETE FROM email_verification_tokens WHERE user_id=? OR expires_at<?',[userId,now]);
  await dbRun('INSERT INTO email_verification_tokens (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)',[makeId('evf_'),userId,hashToken(raw),futureIso(24),now]);
  await enqueueNotification({userId,channel:'email',template:'verify_email',recipient:email,payload:{token:raw}});
  return raw;
}
export async function verifyEmail(token){const row=await dbGet('SELECT * FROM email_verification_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?',[hashToken(token),nowIso()]);if(!row)throw Object.assign(new Error('Token de verificação inválido ou expirado.'),{status:400});const now=nowIso();await dbRun('UPDATE users SET email_verified_at=?,updated_at=? WHERE id=?',[now,now,row.user_id]);await dbRun('UPDATE email_verification_tokens SET used_at=? WHERE id=?',[now,row.id]);return {ok:true};}
export async function resendVerification(user){if(!user.email)return {ok:true,skipped:true};if(user.emailVerified)return {ok:true,alreadyVerified:true};const token=await createEmailVerification(user.id,user.email);return {ok:true,...(config.isProd?{}:{developmentToken:token})};}
export async function revokeOtherSessions(currentSessionId,userId){const r=await dbRun('DELETE FROM sessions WHERE user_id=? AND id<>?',[userId,currentSessionId]);return {ok:true,revoked:Number(r.changes||0)};}
export async function listAddresses(userId){const rows=await dbAll('SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,created_at DESC',[userId]);return rows.map(a=>({id:a.id,label:a.label,recipient:a.recipient,zip:a.zip,street:a.street,number:a.number,complement:a.complement||'',district:a.district||'',city:a.city,state:a.state,isDefault:Boolean(a.is_default)}));}
export async function saveAddress(userId,input){const now=nowIso(),id=input.id||makeId('adr_');const values=[String(input.label||'Principal').slice(0,60),String(input.recipient||'').trim().slice(0,120),String(input.zip||'').replace(/\D/g,'').slice(0,8),String(input.street||'').trim().slice(0,180),String(input.number||'').trim().slice(0,30),String(input.complement||'').trim().slice(0,120),String(input.district||'').trim().slice(0,120),String(input.city||'').trim().slice(0,120),String(input.state||'').trim().toUpperCase().slice(0,2),input.isDefault?1:0];if(!values[1]||values[2].length!==8||!values[3]||!values[4]||!values[7]||values[8].length!==2)throw Object.assign(new Error('Preencha os campos obrigatórios do endereço.'),{status:400});if(values[9])await dbRun('UPDATE addresses SET is_default=0 WHERE user_id=?',[userId]);const exists=await dbGet('SELECT id FROM addresses WHERE id=? AND user_id=?',[id,userId]);if(exists)await dbRun('UPDATE addresses SET label=?,recipient=?,zip=?,street=?,number=?,complement=?,district=?,city=?,state=?,is_default=?,updated_at=? WHERE id=? AND user_id=?',[...values,now,id,userId]);else await dbRun('INSERT INTO addresses (id,user_id,label,recipient,zip,street,number,complement,district,city,state,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,userId,...values,now,now]);return listAddresses(userId);}
export async function deleteAddress(userId,id){await dbRun('DELETE FROM addresses WHERE id=? AND user_id=?',[id,userId]);return {ok:true};}

export const __authTest = Object.freeze({ normalizePhone, syntheticEmail, isSyntheticEmail });
