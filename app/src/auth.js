import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const MAX_AGE = 12 * 3600; // Sekunden

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');

export function checkPassword(pw) {
  const a = Buffer.from(String(pw ?? ''));
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function issueCookie(res) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const val = `${exp}.${sign(String(exp))}`;
  res.setHeader('Set-Cookie', `adm=${val}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}`);
}

export function clearCookie(res) {
  res.setHeader('Set-Cookie', 'adm=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

export function isAdmin(req) {
  const m = /(?:^|;\s*)adm=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || sig.length !== 64) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(exp)))) return false;
  return Number(exp) > Date.now() / 1000;
}

export const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Nicht angemeldet' }));

export const newToken = () => crypto.randomBytes(12).toString('base64url');
