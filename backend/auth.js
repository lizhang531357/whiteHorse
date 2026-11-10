import crypto from 'node:crypto';
import { getUserBySession } from './db.js';

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const COOKIE_NAME = 'bm_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(String(password), salt, 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createSalt() {
  return crypto.randomBytes(16).toString('hex');
}

export function createResetCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export function hashResetCode(code, salt) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

export function verifyResetCode(code, salt, storedHash) {
  try {
    const expected = Buffer.from(String(storedHash), 'hex');
    const actual = Buffer.from(hashResetCode(code, salt), 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function getSessionToken(req) {
  return parseCookies(req)[COOKIE_NAME] || '';
}

export async function getAuthUser(req) {
  return getUserBySession(getSessionToken(req));
}

export function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000,
    )}`,
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

export { SESSION_TTL_MS };
