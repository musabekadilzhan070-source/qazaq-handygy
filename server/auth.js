import crypto from 'node:crypto';
import { config } from './config.js';
import { get, run } from './db.js';

const STUDENT_COOKIE = 'qh_sid';
const ADMIN_COOKIE = 'qh_admin';
const STUDENT_TTL_MS = 1000 * 60 * 60 * 24 * 60; // 60 күн
const ADMIN_TTL_MS = 1000 * 60 * 60 * 8; // 8 сағат

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

/** Constant-time PIN check against the ADMIN_PIN environment variable. */
export function checkAdminPin(pin) {
  if (!config.adminPin) return false;
  const a = Buffer.from(sha256(String(pin ?? '')), 'hex');
  const b = Buffer.from(sha256(config.adminPin), 'hex');
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function cookieString(name, value, { maxAgeMs, sameSite, req }) {
  const secure = config.cookieSecure || req.secure;
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`];
  if (maxAgeMs !== undefined) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function appendCookie(res, value) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, value) : value);
}

function createSession(kind, studentId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttl = kind === 'admin' ? ADMIN_TTL_MS : STUDENT_TTL_MS;
  run(
    'INSERT INTO sessions (token_hash, kind, student_id, expires_at) VALUES (?, ?, ?, ?)',
    sha256(token),
    kind,
    studentId ?? null,
    Date.now() + ttl,
  );
  return { token, ttl };
}

export function startStudentSession(req, res, studentId) {
  const { token, ttl } = createSession('student', studentId);
  appendCookie(res, cookieString(STUDENT_COOKIE, token, { maxAgeMs: ttl, sameSite: 'Lax', req }));
}

export function startAdminSession(req, res) {
  const { token, ttl } = createSession('admin', null);
  appendCookie(res, cookieString(ADMIN_COOKIE, token, { maxAgeMs: ttl, sameSite: 'Strict', req }));
}

function endSession(req, res, cookieName, sameSite) {
  const token = parseCookies(req.headers.cookie)[cookieName];
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  appendCookie(res, cookieString(cookieName, '', { maxAgeMs: 0, sameSite, req }));
}

export const endStudentSession = (req, res) => endSession(req, res, STUDENT_COOKIE, 'Lax');
export const endAdminSession = (req, res) => endSession(req, res, ADMIN_COOKIE, 'Strict');

/** Attaches req.student and req.isAdmin from session cookies. */
export function sessionMiddleware(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  req.student = null;
  req.isAdmin = false;
  const now = Date.now();
  if (cookies[STUDENT_COOKIE]) {
    const row = get(
      `SELECT s.id, s.username, s.display_name, s.created_at FROM sessions x
       JOIN students s ON s.id = x.student_id
       WHERE x.token_hash = ? AND x.kind = 'student' AND x.expires_at > ?`,
      sha256(cookies[STUDENT_COOKIE]),
      now,
    );
    if (row) req.student = row;
  }
  if (cookies[ADMIN_COOKIE]) {
    const row = get(
      "SELECT 1 AS ok FROM sessions WHERE token_hash = ? AND kind = 'admin' AND expires_at > ?",
      sha256(cookies[ADMIN_COOKIE]),
      now,
    );
    req.isAdmin = Boolean(row);
  }
  next();
}

export function requireStudent(req, res, next) {
  if (!req.student) return res.status(401).json({ error: 'Алдымен аккаунтқа кіріңіз.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.isAdmin) return res.status(401).json({ error: 'Ұйымдастырушы ретінде кіру қажет.' });
  next();
}

/** Simple in-memory limiter for login endpoints: N failures per window per key. */
export function makeLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    blocked(key) {
      const h = hits.get(key);
      if (!h) return 0;
      if (h.until && h.until > Date.now()) return Math.ceil((h.until - Date.now()) / 1000);
      if (h.until && h.until <= Date.now()) hits.delete(key);
      return 0;
    },
    fail(key) {
      const h = hits.get(key) || { count: 0, until: 0 };
      h.count += 1;
      if (h.count >= max) {
        h.until = Date.now() + windowMs;
        h.count = 0;
      }
      hits.set(key, h);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

export function purgeExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  run('DELETE FROM quiz_attempts WHERE created_at < ? ', Date.now() - 1000 * 60 * 60 * 24 * 2);
}
