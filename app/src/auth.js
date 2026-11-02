import crypto from 'node:crypto';
import { q } from './db.js';

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const MAX_AGE = 12 * 3600; // Sekunden

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(pw), salt, 64).toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(String(pw ?? ''), salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Beim ersten Start: Benutzer "admin" mit ADMIN_PASSWORD anlegen
export async function ensureAdminUser() {
  const { rows } = await q('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n === 0) {
    await q('INSERT INTO users (username, password_hash) VALUES ($1,$2)', ['admin', hashPassword(process.env.ADMIN_PASSWORD || 'admin')]);
    console.log('Admin-Benutzer "admin" angelegt');
  }
}

export async function login(username, password) {
  const { rows } = await q('SELECT * FROM users WHERE lower(username)=lower($1)', [String(username || '').trim()]);
  const u = rows[0];
  // Auch bei unbekanntem Benutzer hashen, damit die Antwortzeit nicht verrät, ob er existiert
  const ok = verifyPassword(password, u ? u.password_hash : 'x:y');
  return u && ok ? u : null;
}

export function issueCookie(res, uid, base = '') {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${uid}.${exp}`;
  res.setHeader('Set-Cookie', `adm=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=${base || '/'}; Max-Age=${MAX_AGE}`);
}
export function clearCookie(res, base = '') {
  res.setHeader('Set-Cookie', `adm=; HttpOnly; SameSite=Strict; Path=${base || '/'}; Max-Age=0`);
}

// Liefert den angemeldeten Benutzer (oder null); gelöschte Benutzer verlieren sofort den Zugang
export async function currentUser(req) {
  if (req.user !== undefined) return req.user;
  req.user = null;
  const m = /(?:^|;\s*)adm=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [uid, exp, sig] = m[1].split('.');
  if (!uid || !exp || !sig || sig.length !== 64) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(`${uid}.${exp}`)))) return null;
  if (Number(exp) <= Date.now() / 1000) return null;
  const { rows } = await q('SELECT id, username FROM users WHERE id=$1', [Number(uid)]);
  req.user = rows[0] || null;
  return req.user;
}

export const requireAdmin = (req, res, next) =>
  currentUser(req).then((u) => (u ? next() : res.status(401).json({ error: 'Nicht angemeldet' }))).catch(next);

export const newToken = () => crypto.randomBytes(12).toString('base64url');
