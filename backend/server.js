import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  publicUser,
  getUserByEmail,
  createUser,
  updateUserProfile,
  updateUserAvatar,
  createSession,
  deleteSession,
  listConversations,
  upsertConversations,
  deleteConversations,
  getRawSettings,
  saveSettings,
  parseModels,
  createFileRecord,
  getFileRecord,
  savePasswordReset,
  getPasswordReset,
  deletePasswordReset,
  incrementPasswordResetAttempts,
  updateUserPassword,
  deleteUserSessions,
  deleteUser,
  deleteAllConversations,
  deleteAllFiles,
  cleanupSessions,
} from './db.js';
import {
  hashPassword,
  verifyPassword,
  createToken,
  createSalt,
  createResetCode,
  hashResetCode,
  verifyResetCode,
  getSessionToken,
  getAuthUser,
  setSessionCookie,
  clearSessionCookie,
  SESSION_TTL_MS,
} from './auth.js';
import { isMailConfigured, sendResetCode } from './mailer.js';

const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const PORT = process.env.PORT || 3001;
const ALLOW_REGISTER = process.env.ALLOW_REGISTER !== 'false';

// 项目根目录（backend 的上一级），dist/data 等仍位于根目录
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const dataRoot = process.env.DATA_DIR || path.join(rootDir, 'data');
const uploadsDir = path.join(dataRoot, 'uploads');

// 5 个 8MB 附件经 base64 编码后约 53MB，留出余量
const MAX_BODY_BYTES = 60 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ITEM_CHARS = 12000;
const MAX_TOTAL_CHARS = 40000;
const MAX_HISTORY_ITEMS = 30;
const MAX_HISTORY_IMAGES = 8;
const MAX_IMAGE_URL_CHARS = 800000;

const DEFAULT_SYSTEM_PROMPT =
  '你是白马AI，一个乐于助人的 AI 助手。用户消息后面可能附带从附件或链接中读取的内容，' +
  '也可能附带图片，请结合这些内容回答；如果提示某些附件读取失败，请如实告知用户。';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'log', 'xml', 'yml', 'yaml',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'css', 'less', 'scss', 'sass', 'html', 'htm',
  'vue', 'svelte', 'py', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb',
  'php', 'swift', 'dart', 'sql', 'sh', 'bash', 'zsh', 'env', 'ini', 'toml', 'conf', 'gitignore',
]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function extOf(name = '') {
  const clean = String(name).split(/[?#]/)[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

function isTextType(type = '') {
  return (
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('xml') ||
    type.includes('javascript') ||
    type.includes('x-yaml') ||
    type.includes('sql')
  );
}

function isImage(name = '', type = '') {
  return IMAGE_EXTS.has(extOf(name)) || String(type).startsWith('image/');
}

function imageMime(name = '', type = '') {
  if (String(type).startsWith('image/')) return type.split(';')[0];
  const ext = extOf(name);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/jpeg';
}

function truncate(text) {
  const value = String(text || '').trim();
  if (value.length <= MAX_ITEM_CHARS) return value;
  return value.slice(0, MAX_ITEM_CHARS) + '\n…（内容过长，已截断）';
}

let pdfParserPromise;
async function pdfToText(buffer) {
  if (!pdfParserPromise) {
    pdfParserPromise = import('pdf-parse/lib/pdf-parse.js').then((mod) => mod.default);
  }
  const parse = await pdfParserPromise;
  const data = await parse(buffer);
  return data.text;
}

let mammothPromise;
async function docxToText(buffer) {
  if (!mammothPromise) {
    mammothPromise = import('mammoth').then((mod) => mod.default || mod);
  }
  const mammoth = await mammothPromise;
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function isZipBuffer(buffer) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  );
}

async function extractBuffer(buffer, name, type = '') {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('文件超过 8MB');
  }

  const ext = extOf(name);
  const lowerType = String(type || '').toLowerCase();

  // 先按二进制文档格式识别，避免 MIME 里的 "openxmlformats/xml" 被当成文本
  if (ext === 'pdf' || lowerType.includes('pdf')) {
    return pdfToText(buffer);
  }
  if (ext === 'docx' || lowerType.includes('wordprocessingml.document')) {
    return docxToText(buffer);
  }
  if (ext === 'doc' || lowerType.includes('msword')) {
    throw new Error('暂不支持旧版 .doc，请用 Word 另存为 .docx 后再上传');
  }
  if (
    ext === 'xlsx' ||
    ext === 'xls' ||
    lowerType.includes('spreadsheetml') ||
    lowerType.includes('ms-excel')
  ) {
    throw new Error('暂不支持 Excel 文件，请把内容复制成文本后再上传');
  }
  if (
    ext === 'pptx' ||
    ext === 'ppt' ||
    lowerType.includes('presentationml') ||
    lowerType.includes('ms-powerpoint')
  ) {
    throw new Error('暂不支持 PPT 文件，请把内容复制成文本后再上传');
  }

  // 真正的文本类型（排除 ZIP 包头，防止把 office 压缩包当文本）
  if ((TEXT_EXTS.has(ext) || isTextType(type)) && !isZipBuffer(buffer)) {
    return new TextDecoder('utf-8').decode(buffer);
  }

  const text = buffer.toString('utf8');
  if (!isZipBuffer(buffer) && !text.includes('\u0000')) return text;
  throw new Error('暂不支持该文件类型，请上传文本 / PDF / Word(docx)');
}

function isPrivateHost(host = '') {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') return true;

  const version = net.isIP(h);
  if (!version) return false;

  if (version === 4) {
    const [a, b] = h.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254)
    );
  }

  if (h === '::' || h === '::1') return true;
  if (h.startsWith('::ffff:')) {
    const mapped = h.slice('::ffff:'.length);
    if (net.isIP(mapped) === 4) return isPrivateHost(mapped);
  }
  return h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
}

async function assertPublicUrl(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http/https 链接');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isPrivateHost(hostname)) {
    throw new Error('不能访问内网地址');
  }

  // 域名可能解析到内网地址（含 DNS rebinding），逐个校验解析结果
  if (!net.isIP(hostname)) {
    let records;
    try {
      records = await dns.lookup(hostname, { all: true });
    } catch {
      throw new Error('域名解析失败');
    }
    if (!records.length) throw new Error('域名解析失败');
    for (const record of records) {
      if (isPrivateHost(record.address)) {
        throw new Error('不能访问内网地址');
      }
    }
  }
}

async function fetchUrlResource(rawUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    let url = new URL(rawUrl);
    let res;

    // 手动跟随重定向，每一跳都重新校验，防止跳转到内网
    for (let hop = 0; hop <= 5; hop += 1) {
      await assertPublicUrl(url);
      res = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'user-agent': 'BaiMa/1.0' },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new Error(`HTTP ${res.status}`);
        if (hop === 5) throw new Error('重定向次数过多');
        url = new URL(location, url);
        res.body?.cancel?.();
        continue;
      }
      break;
    }

    if (!res) throw new Error('请求失败');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const length = Number(res.headers.get('content-length') || 0);
    if (length > MAX_FILE_BYTES) throw new Error('附件超过 8MB');

    const buffer = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || '';

    if (isImage(url.pathname, type)) {
      return {
        kind: 'image',
        dataUrl: `data:${imageMime(url.pathname, type)};base64,${buffer.toString('base64')}`,
      };
    }

    return { kind: 'text', text: await extractBuffer(buffer, url.pathname, type) };
  } finally {
    clearTimeout(timer);
  }
}

function pickUrls(message) {
  const matches = String(message).match(/https?:\/\/[^\s<>"'）)]+/g) || [];
  const cleaned = matches.map((url) => url.replace(/[.,;:!?。，；：！？]+$/, ''));
  return [...new Set(cleaned)];
}

function buildPrompt(message, attachmentsText, urlsText, warnings) {
  const parts = [];
  if (message) parts.push(message);
  if (attachmentsText.length) parts.push(attachmentsText.join('\n\n'));
  if (urlsText.length) parts.push(urlsText.join('\n\n'));
  if (warnings.length) parts.push('[附件读取提示]\n' + warnings.join('\n'));

  let content = parts.join('\n\n') || '请查看我提供的附件或图片内容。';
  if (content.length > MAX_TOTAL_CHARS) {
    content = content.slice(0, MAX_TOTAL_CHARS) + '\n…（内容过长，已截断）';
  }
  return content;
}

function clampTemperature(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.7;
  return Math.min(2, Math.max(0, num));
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  const source = history.slice(-MAX_HISTORY_ITEMS);
  const kept = [];
  let total = 0;
  let images = 0;

  for (let i = source.length - 1; i >= 0; i -= 1) {
    const item = source[i];
    if (!item || (item.role !== 'user' && item.role !== 'assistant')) continue;

    const content = item.content;
    let normalized = null;

    if (typeof content === 'string') {
      const text = content.trim();
      if (!text) continue;
      const clipped = text.slice(0, MAX_ITEM_CHARS);
      total += clipped.length;
      normalized = { role: item.role, content: clipped };
    } else if (Array.isArray(content)) {
      const parts = [];
      for (const part of content) {
        if (!part || typeof part !== 'object') continue;

        if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
          const text = part.text.slice(0, MAX_ITEM_CHARS);
          parts.push({ type: 'text', text });
          total += text.length;
        } else if (
          part.type === 'image_url' &&
          part.image_url &&
          typeof part.image_url.url === 'string' &&
          part.image_url.url.startsWith('data:image/') &&
          part.image_url.url.length <= MAX_IMAGE_URL_CHARS &&
          images < MAX_HISTORY_IMAGES
        ) {
          parts.push({ type: 'image_url', image_url: { url: part.image_url.url } });
          images += 1;
        }
      }
      if (parts.length) normalized = { role: item.role, content: parts };
    }

    if (!normalized) continue;
    if (total > MAX_TOTAL_CHARS * 2) break;
    kept.unshift(normalized);
  }

  return kept;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, extra) {
  sendJson(res, status, { error: message, ...(extra || {}) });
}

const rateBuckets = new Map();

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function checkRate(key, limit, windowMs) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

function rateLimited(res, retryAfter = 60) {
  res.writeHead(429, {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': String(retryAfter),
  });
  res.end(JSON.stringify({ error: '请求过于频繁，请稍后再试' }));
}

const rateCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start > 10 * 60 * 1000) rateBuckets.delete(key);
  }
}, 60 * 1000);
rateCleanupTimer.unref?.();

async function readJsonBody(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    sendError(res, 400, err.message);
    return null;
  }
  try {
    return JSON.parse(body.toString('utf8') || '{}');
  } catch {
    sendError(res, 400, '请求体不是合法 JSON');
    return null;
  }
}

function requireUser(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    sendError(res, 401, '请先登录');
    return null;
  }
  return user;
}

const AVATAR_COLORS = ['#185fa5', '#7a4fd0', '#0f8a5f', '#b45309', '#b23a48', '#2f6f8f'];

function pickColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function safeExtOf(name = '') {
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(String(name));
  return match ? `.${match[1].toLowerCase()}` : '';
}

function saveUploadedFile(userId, name, type, buffer) {
  try {
    const id = crypto.randomUUID();
    const ext = safeExtOf(name);
    const userDir = String(userId);
    const dir = path.join(uploadsDir, userDir);
    fs.mkdirSync(dir, { recursive: true });
    const relativePath = path.join(userDir, `${id}${ext}`);
    fs.writeFileSync(path.join(uploadsDir, relativePath), buffer);

    const displayName = String(name || '未命名附件').slice(0, 200);
    const mime = String(type || 'application/octet-stream').slice(0, 120);
    createFileRecord({ id, userId, name: displayName, size: buffer.length, mime, path: relativePath });

    return { id, name: displayName, size: buffer.length, type: mime };
  } catch {
    return null;
  }
}

function maskKey(key = '') {
  if (!key) return '';
  if (key.length <= 8) return '••••••';
  return `${key.slice(0, 4)}••••••${key.slice(-4)}`;
}

function settingsView(userId) {
  const settings = getRawSettings(userId);
  return {
    model: settings.model || '',
    models: parseModels(settings.models),
    baseUrl: settings.base_url || '',
    temperature: settings.temperature ?? 0.7,
    systemPrompt: settings.system_prompt || '',
    hasApiKey: Boolean(settings.api_key),
    apiKeyMasked: maskKey(settings.api_key),
  };
}

async function handleRegister(req, res) {
  if (!ALLOW_REGISTER) {
    return sendError(res, 403, '注册已关闭，请使用已有账号登录');
  }

  const body = await readJsonBody(req, res);
  if (!body) return;

  const name = String(body.name || '').trim().slice(0, 40);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  const password = String(body.password || '');

  if (!name) return sendError(res, 400, '请输入昵称', { field: 'name' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return sendError(res, 400, '请输入有效邮箱', { field: 'email' });
  }
  if (password.length < 6) return sendError(res, 400, '密码至少 6 位', { field: 'password' });
  if (getUserByEmail(email)) {
    return sendError(res, 409, '该邮箱已注册，请直接登录', { field: 'email' });
  }

  const user = createUser({
    name,
    email,
    passwordHash: hashPassword(password),
    color: pickColor(),
    createdAt: Date.now(),
  });

  const token = createToken();
  createSession(token, user.id, SESSION_TTL_MS);
  setSessionCookie(res, token);
  sendJson(res, 200, { user: publicUser(user) });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = email ? getUserByEmail(email) : null;

  if (!user) {
    return sendError(res, 404, '该邮箱尚未注册，请先注册', { field: 'email' });
  }
  if (!verifyPassword(password, user.password_hash)) {
    return sendError(res, 401, '密码不正确', { field: 'password' });
  }

  const token = createToken();
  createSession(token, user.id, SESSION_TTL_MS);
  setSessionCookie(res, token);
  sendJson(res, 200, { user: publicUser(user) });
}

function handleLogout(req, res) {
  const token = getSessionToken(req);
  if (token) deleteSession(token);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

function handleMe(req, res) {
  const user = getAuthUser(req);
  if (!user) return sendError(res, 401, '未登录');
  sendJson(res, 200, { user: publicUser(user) });
}

async function handleProfile(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const body = await readJsonBody(req, res);
  if (!body) return;

  const name = String(body.name || '').trim().slice(0, 40);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);

  if (!name) return sendError(res, 400, '昵称不能为空');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendError(res, 400, '请输入有效邮箱');

  const existing = getUserByEmail(email);
  if (existing && existing.id !== user.id) return sendError(res, 409, '该邮箱已被使用');

  const updated = updateUserProfile(user.id, name, email);
  sendJson(res, 200, { user: publicUser(updated) });
}

async function handleUpdateAvatar(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const body = await readJsonBody(req, res);
  if (!body) return;

  const avatar = typeof body.avatar === 'string' ? body.avatar.trim() : '';
  if (avatar) {
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(avatar)) {
      return sendError(res, 400, '头像格式不支持');
    }
    if (avatar.length > 1024 * 1024) {
      return sendError(res, 400, '头像太大了，请换一张更小的图片');
    }
  }

  const updated = updateUserAvatar(user.id, avatar);
  sendJson(res, 200, { user: publicUser(updated) });
}

async function handleChangePassword(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const body = await readJsonBody(req, res);
  if (!body) return;

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');

  if (!verifyPassword(currentPassword, user.password_hash)) {
    return sendError(res, 400, '当前密码不正确', { field: 'currentPassword' });
  }
  if (newPassword.length < 6) {
    return sendError(res, 400, '新密码至少 6 位', { field: 'newPassword' });
  }
  if (newPassword === currentPassword) {
    return sendError(res, 400, '新密码不能与当前密码相同', { field: 'newPassword' });
  }

  updateUserPassword(user.id, hashPassword(newPassword));
  // 其它设备上的登录失效，当前设备保持登录
  deleteUserSessions(user.id, getSessionToken(req));
  sendJson(res, 200, { ok: true });
}

async function handleForgotPassword(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return sendError(res, 400, '请输入邮箱', { field: 'email' });

  const user = getUserByEmail(email);
  const mailReady = isMailConfigured();

  if (!user) {
    // 邮箱不存在也返回相同结构，避免暴露账号是否存在（终端留一条记录便于管理员排查）
    console.log(`[reset] 未注册邮箱请求：${email}`);
    return sendJson(res, 200, { ok: true, mailSent: mailReady });
  }

  const code = createResetCode();
  const salt = createSalt();
  savePasswordReset(user.id, hashResetCode(code, salt), salt, Date.now() + 10 * 60 * 1000);

  let sent = false;
  try {
    sent = await sendResetCode(email, code);
  } catch (err) {
    console.error('[reset] 邮件发送失败：', err.message);
  }

  if (!sent) {
    console.log(`[reset] ${email} 的验证码：${code}（10 分钟内有效）`);
  }

  sendJson(res, 200, { ok: true, mailSent: sent });
}

async function handleResetPassword(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').trim();
  const newPassword = String(body.newPassword || '');

  if (!email) return sendError(res, 400, '请输入邮箱', { field: 'email' });
  if (!/^\d{6}$/.test(code)) return sendError(res, 400, '请输入 6 位验证码', { field: 'code' });
  if (newPassword.length < 6) {
    return sendError(res, 400, '新密码至少 6 位', { field: 'newPassword' });
  }

  const user = getUserByEmail(email);
  const reset = user ? getPasswordReset(user.id) : null;
  const invalid = () => sendError(res, 400, '验证码错误或已过期', { field: 'code' });

  if (!user || !reset) return invalid();
  if (reset.expires_at <= Date.now()) {
    deletePasswordReset(user.id);
    return invalid();
  }
  if (reset.attempts >= 5) {
    deletePasswordReset(user.id);
    return invalid();
  }
  if (!verifyResetCode(code, reset.salt, reset.code_hash)) {
    incrementPasswordResetAttempts(user.id);
    return invalid();
  }

  updateUserPassword(user.id, hashPassword(newPassword));
  deletePasswordReset(user.id);
  deleteUserSessions(user.id);
  sendJson(res, 200, { ok: true });
}

function handleGetSettings(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  sendJson(res, 200, settingsView(user.id));
}

async function handlePutSettings(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const body = await readJsonBody(req, res);
  if (!body) return;

  const current = getRawSettings(user.id);
  let apiKey = current.api_key || '';
  if (body.clearApiKey === true) {
    apiKey = '';
  } else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    apiKey = body.apiKey.trim();
  }

  let baseUrl =
    typeof body.baseUrl === 'string' ? body.baseUrl.trim().slice(0, 300) : current.base_url || '';
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('protocol');
      }
      baseUrl = baseUrl.replace(/\/+$/, '');
    } catch {
      return sendError(res, 400, 'BASE_URL 必须是 http/https 地址', { field: 'baseUrl' });
    }
  }

  saveSettings(user.id, {
    model: typeof body.model === 'string' ? body.model : current.model,
    models: Array.isArray(body.models) ? body.models : parseModels(current.models),
    baseUrl,
    temperature:
      body.temperature === undefined ? current.temperature : Number(body.temperature),
    systemPrompt:
      typeof body.systemPrompt === 'string' ? body.systemPrompt : current.system_prompt,
    apiKey,
  });

  sendJson(res, 200, settingsView(user.id));
}

function handleRevealApiKey(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const settings = getRawSettings(user.id);
  if (!settings.api_key) return sendError(res, 404, '还没有配置 API Key');

  res.setHeader('Cache-Control', 'no-store');
  sendJson(res, 200, { apiKey: settings.api_key });
}

async function handleTestConnection(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const body = await readJsonBody(req, res);
  if (!body) return;

  const current = getRawSettings(user.id);
  const rawBaseUrl =
    typeof body.baseUrl === 'string' && body.baseUrl.trim()
      ? body.baseUrl.trim()
      : current.base_url || BASE_URL;

  let baseUrl;
  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
    baseUrl = rawBaseUrl.replace(/\/+$/, '');
  } catch {
    return sendError(res, 400, '接口地址必须是 http/https 地址', { field: 'baseUrl' });
  }

  const apiKey =
    typeof body.apiKey === 'string' && body.apiKey.trim()
      ? body.apiKey.trim()
      : current.api_key;
  if (!apiKey) return sendError(res, 400, '请先填写 API Key', { field: 'apiKey' });

  const model = (typeof body.model === 'string' && body.model.trim()) || current.model || '';
  if (!model) return sendError(res, 400, '还没有配置模型，无法验证对话连通性');

  try {
    // 用当前选中的模型发一条最小对话请求，验证「地址+密钥+模型」整体可用
    const chatRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
    });

    if (chatRes.ok) return sendJson(res, 200, { ok: true });

    let detail = '';
    try {
      const data = await chatRes.json();
      detail = data?.error?.message || data?.error?.type || '';
    } catch {
      detail = '';
    }

    // 将常见原始报错映射为语义化提示
    const text = String(detail);
    let friendly = '';
    if (chatRes.status === 401 || /invalid.*key|unauthorized|authentication/i.test(text)) {
      friendly = 'API 密钥无效或已过期，请检查 API Key';
    } else if (/no available channel|not found|does not exist|无可用渠道|模型不存在/i.test(text)) {
      friendly = `当前模型「${model}」无法使用，请检查模型名称是否正确`;
    } else if (chatRes.status === 429 || /rate.?limit|quota|insufficient/i.test(text)) {
      friendly = '请求过于频繁或额度不足，请稍后重试';
    } else if (chatRes.status === 404) {
      friendly = '接口地址不正确，请检查接口地址';
    } else if (chatRes.status >= 500) {
      friendly = '模型服务暂时不可用，请稍后重试';
    }

    return sendJson(res, 200, {
      ok: false,
      error: friendly || detail || `连接失败（HTTP ${chatRes.status}）`,
    });
  } catch (err) {
    return sendJson(res, 200, { ok: false, error: '连接失败：' + err.message });
  }
}

function handleDeleteAllConversations(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  deleteAllConversations(user.id);
  deleteAllFiles(user.id);
  try {
    fs.rmSync(path.join(uploadsDir, String(user.id)), { recursive: true, force: true });
  } catch {
    // 附件目录可能不存在
  }

  sendJson(res, 200, { ok: true });
}

function handleDeleteAccount(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  try {
    fs.rmSync(path.join(uploadsDir, String(user.id)), { recursive: true, force: true });
  } catch {
    // 附件目录可能不存在
  }

  deleteUser(user.id);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

function getPublicUrl(req) {
  const configured = String(process.env.PUBLIC_URL || '').trim()
  if (configured) return configured

  try {
    const file = path.join(dataRoot, 'public-url.txt')
    if (fs.existsSync(file)) {
      const value = fs.readFileSync(file, 'utf8').trim()
      if (/^https?:\/\//i.test(value)) return value
    }
  } catch {
    // 忽略读取失败
  }

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  if (host && !/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(host)) {
    const proto = String(
      req.headers['x-forwarded-proto'] || (req.headers['cf-connecting-ip'] ? 'https' : 'http'),
    )
    return `${proto}://${host}`
  }

  return ''
}

function handleShare(req, res) {
  const url = getPublicUrl(req)
  sendJson(res, 200, { url })
}

function handleExport(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const settings = getRawSettings(user.id);
  const payload = {
    exportedAt: new Date().toISOString(),
    user: publicUser(user),
    settings: {
      model: settings.model,
      temperature: settings.temperature,
      systemPrompt: settings.system_prompt,
      hasApiKey: Boolean(settings.api_key),
    },
    conversations: listConversations(user.id),
  };

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="baima-export-${Date.now()}.json"`,
  });
  res.end(JSON.stringify(payload, null, 2));
}

function handleFileDownload(req, res, fileId) {
  const user = requireUser(req, res);
  if (!user) return;

  const record = getFileRecord(fileId, user.id);
  if (!record) return sendError(res, 404, '文件不存在');

  const filePath = path.resolve(uploadsDir, record.path);
  if (!filePath.startsWith(uploadsDir + path.sep) || !fs.existsSync(filePath)) {
    return sendError(res, 404, '文件不存在');
  }

  const filename = encodeURIComponent(record.name || 'file');
  res.writeHead(200, {
    'Content-Type': record.mime || 'application/octet-stream',
    'Content-Length': record.size,
    'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    'Cache-Control': 'private, max-age=0',
  });
  fs.createReadStream(filePath).pipe(res);
}

const TITLE_INSTRUCTION =
  '你是一个标题生成助手。根据下面的对话内容，生成一个不超过 12 个字符的简短标题。只输出标题，不要引号、标点或解释。';

async function handleTitle(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const body = await readJsonBody(req, res);
  if (!body) return;

  const text = String(body.text || '').trim().slice(0, 2000);
  if (!text) return sendError(res, 400, '内容为空');

  const settings = getRawSettings(user.id);
  const apiKey = (settings.api_key || '').trim();
  if (!apiKey) return sendError(res, 400, '未配置 API Key');

  const baseUrl = (settings.base_url || BASE_URL).replace(/\/+$/, '');
  const model = settings.model || '';
  if (!model) return sendError(res, 400, '还没有配置模型');
  const isReasoner = /reasoner/i.test(model);
  const messages = isReasoner
    ? [{ role: 'user', content: `${TITLE_INSTRUCTION}\n\n对话内容：\n${text}` }]
    : [
        { role: 'system', content: TITLE_INSTRUCTION },
        { role: 'user', content: text },
      ];

  const requestBody = {
    model,
    stream: false,
    messages,
    max_tokens: 256,
  };
  if (!isReasoner) requestBody.temperature = 0.3;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!upstream.ok) return sendError(res, 502, '标题生成失败');

    const data = await upstream.json();
    const title = String(data?.choices?.[0]?.message?.content || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
      .trim()
      .slice(0, 20);

    if (!title) return sendError(res, 502, '标题生成失败');
    sendJson(res, 200, { title });
  } catch {
    sendError(res, 502, '标题生成失败');
  } finally {
    clearTimeout(timer);
  }
}

function handleGetConversations(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  sendJson(res, 200, { conversations: listConversations(user.id) });
}

async function handleSyncConversations(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const body = await readJsonBody(req, res);
  if (!body) return;

  const upserts = Array.isArray(body.upserts) ? body.upserts.slice(0, 200) : [];
  const deletes = Array.isArray(body.deletes)
    ? body.deletes.filter((id) => typeof id === 'string').slice(0, 200)
    : [];

  const safeUpserts = upserts
    .filter((conv) => conv && typeof conv.id === 'string')
    .map((conv) => ({
      id: conv.id,
      title: conv.title,
      messages: conv.messages,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    }));

  upsertConversations(user.id, safeUpserts);
  deleteConversations(user.id, deletes);

  sendJson(res, 200, { ok: true });
}

async function handleChat(req, res) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    sendError(res, 401, '请先登录');
    return;
  }

  const rawSettings = getRawSettings(authUser.id);
  const baseUrl = (rawSettings.base_url || BASE_URL).replace(/\/+$/, '');
  const apiKey = (rawSettings.api_key || '').trim();
  if (!apiKey) {
    sendError(res, 400, '请先在「我的 - 通用设置」里填写 API Key');
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body.toString('utf8') || '{}');
  } catch {
    sendJson(res, 400, { error: '请求体不是合法 JSON' });
    return;
  }

  const message = String(payload.message || '').trim();
  const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 5) : [];

  if (!message && attachments.length === 0) {
    sendJson(res, 400, { error: '消息和附件不能同时为空' });
    return;
  }

  const requested = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
  const model =
    typeof requested.model === 'string' && requested.model.trim()
      ? requested.model.trim().slice(0, 64)
      : rawSettings.model || '';
  if (!model) {
    sendJson(res, 400, {
      error: '还没有配置模型，请先在「系统设置 → 模型管理」中添加并选择模型',
    });
    return;
  }

  const attachmentsText = [];
  const urlsText = [];
  const imageUrls = [];
  const warnings = [];
  const savedFiles = [];

  for (const attachment of attachments) {
    const name = attachment?.name || '未命名附件';
    const type = attachment?.type || '';
    let saved = null;
    try {
      if (!attachment?.data) throw new Error('文件内容为空');
      const buffer = Buffer.from(attachment.data, 'base64');
      if (buffer.length > MAX_FILE_BYTES) throw new Error('文件超过 8MB');

      saved = saveUploadedFile(authUser.id, name, type, buffer);

      if (isImage(name, type)) {
        imageUrls.push(`data:${imageMime(name, type)};base64,${buffer.toString('base64')}`);
      } else {
        const text = await extractBuffer(buffer, name, type);
        attachmentsText.push(`--- 附件：${name} ---\n${truncate(text)}`);
      }
    } catch (err) {
      warnings.push(`附件「${name}」读取失败：${err.message}`);
    }
    savedFiles.push(saved);
  }

  for (const url of pickUrls(message)) {
    try {
      const resource = await fetchUrlResource(url);
      if (resource.kind === 'image') {
        imageUrls.push(resource.dataUrl);
      } else {
        urlsText.push(`--- 链接：${url} ---\n${truncate(resource.text)}`);
      }
    } catch (err) {
      warnings.push(`链接 ${url} 读取失败：${err.message}`);
    }
  }

  const textContent = buildPrompt(message, attachmentsText, urlsText, warnings);
  const content = [{ type: 'text', text: textContent }];
  for (const url of imageUrls.slice(0, 5)) {
    content.push({ type: 'image_url', image_url: { url } });
  }

  const isReasoner = /reasoner/i.test(model);
  const systemPrompt =
    typeof requested.systemPrompt === 'string' && requested.systemPrompt.trim()
      ? requested.systemPrompt.trim()
      : rawSettings.system_prompt || DEFAULT_SYSTEM_PROMPT;
  const temperature = clampTemperature(
    requested.temperature === undefined ? rawSettings.temperature : requested.temperature,
  );
  const history = normalizeHistory(payload.history);

  let messages;
  if (isReasoner) {
    const mergedContent = content.map((part, index) =>
      index === 0 && part.type === 'text'
        ? { ...part, text: `${systemPrompt}\n\n${part.text}` }
        : part,
    );
    messages = [...history, { role: 'user', content: mergedContent }];
  } else {
    messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content },
    ];
  }

  const requestBody = {
    model,
    stream: true,
    messages,
    stream_options: { include_usage: true },
  };
  if (!isReasoner) {
    requestBody.temperature = temperature;
  }

  let upstream;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    sendJson(res, 500, { error: '调用模型失败：' + err.message });
    return;
  }

  const contentType = upstream.headers.get('content-type') || '';

  if (!upstream.ok || contentType.includes('application/json')) {
    let data;
    try {
      data = await upstream.json();
    } catch {
      data = null;
    }

    if (data?.error) {
      const msg = data.error.message || data.error.type || JSON.stringify(data.error);
      sendJson(res, 200, { error: msg });
    } else {
      sendJson(res, 200, { error: '模型未返回内容：' + JSON.stringify(data) });
    }
    return;
  }

  if (!upstream.body) {
    sendJson(res, 500, { error: '模型没有返回流式内容' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`data: ${JSON.stringify({ type: 'model', model })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'prompt', content: textContent })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'files', files: savedFiles })}\n\n`);

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: '流式读取中断：' + err.message })}\n\n`);
  } finally {
    res.end();
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  if (!fs.existsSync(distDir)) return false;

  let relative = pathname;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    relative = pathname;
  }
  if (relative === '/') relative = '/index.html';

  const target = path.resolve(distDir, `.${relative}`);
  if (target !== distDir && !target.startsWith(distDir + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  let filePath = target;
  if (!(fs.existsSync(filePath) && fs.statSync(filePath).isFile())) {
    if (path.extname(relative)) return false;
    filePath = path.join(distDir, 'index.html');
    if (!fs.existsSync(filePath)) return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const { method } = req;

  try {
    if (pathname.startsWith('/api')) {
      const ip = clientIp(req);
      let allowed = true;
      if (pathname === '/api/auth/login') {
        allowed = checkRate(`login:${ip}`, 20, 5 * 60 * 1000);
        if (!allowed) return rateLimited(res, 300);
      } else if (pathname === '/api/auth/register') {
        allowed = checkRate(`register:${ip}`, 5, 60 * 60 * 1000);
        if (!allowed) return rateLimited(res, 3600);
      } else if (pathname === '/api/auth/forgot') {
        allowed = checkRate(`forgot:${ip}`, 5, 15 * 60 * 1000);
        if (!allowed) return rateLimited(res, 900);
      } else if (pathname === '/api/auth/reset') {
        allowed = checkRate(`reset:${ip}`, 10, 15 * 60 * 1000);
        if (!allowed) return rateLimited(res, 900);
      } else if (pathname === '/api/chat') {
        allowed = checkRate(`chat:${ip}`, 30, 60 * 1000);
        if (!allowed) return rateLimited(res, 60);
      } else {
        allowed = checkRate(`api:${ip}`, 300, 60 * 1000);
        if (!allowed) return rateLimited(res, 60);
      }
    }

    if (method === 'GET' && pathname === '/api/config') {
      sendJson(res, 200, {
        defaultBaseUrl: BASE_URL,
        allowRegister: ALLOW_REGISTER,
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/auth/register') return await handleRegister(req, res);
    if (method === 'POST' && pathname === '/api/auth/login') return await handleLogin(req, res);
    if (method === 'POST' && pathname === '/api/auth/logout') return handleLogout(req, res);
    if (method === 'GET' && pathname === '/api/auth/me') return handleMe(req, res);
    if (method === 'PUT' && pathname === '/api/auth/profile') return await handleProfile(req, res);
    if (method === 'PUT' && pathname === '/api/auth/avatar') return await handleUpdateAvatar(req, res);
    if (method === 'PUT' && pathname === '/api/auth/password') return await handleChangePassword(req, res);
    if (method === 'DELETE' && pathname === '/api/auth/account') return handleDeleteAccount(req, res);
    if (method === 'POST' && pathname === '/api/auth/forgot') return await handleForgotPassword(req, res);
    if (method === 'POST' && pathname === '/api/auth/reset') return await handleResetPassword(req, res);

    if (method === 'GET' && pathname === '/api/settings') return handleGetSettings(req, res);
    if (method === 'GET' && pathname === '/api/settings/api-key') return handleRevealApiKey(req, res);
    if (method === 'PUT' && pathname === '/api/settings') return await handlePutSettings(req, res);
    if (method === 'POST' && pathname === '/api/settings/test') return await handleTestConnection(req, res);

    if (method === 'POST' && pathname === '/api/title') return await handleTitle(req, res);
    if (method === 'GET' && pathname.startsWith('/api/files/')) {
      const fileId = decodeURIComponent(pathname.slice('/api/files/'.length));
      return handleFileDownload(req, res, fileId);
    }

    if (method === 'GET' && pathname === '/api/share') return handleShare(req, res);
    if (method === 'GET' && pathname === '/api/export') return handleExport(req, res);
    if (method === 'GET' && pathname === '/api/conversations') return handleGetConversations(req, res);
    if (method === 'DELETE' && pathname === '/api/conversations') {
      return handleDeleteAllConversations(req, res);
    }
    if (method === 'POST' && pathname === '/api/conversations/sync') {
      return await handleSyncConversations(req, res);
    }

    if (method === 'POST' && pathname === '/api/chat') return await handleChat(req, res);

    if (
      !pathname.startsWith('/api') &&
      (method === 'GET' || method === 'HEAD') &&
      serveStatic(req, res, pathname)
    ) {
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  } catch (err) {
    console.error('请求处理失败:', err);
    if (!res.headersSent) sendError(res, 500, '服务端错误：' + err.message);
    else res.end();
  }
});

cleanupSessions();
const cleanupTimer = setInterval(cleanupSessions, 6 * 3600 * 1000);
cleanupTimer.unref?.();

server.listen(PORT, () => {
  console.log(`后端已启动：http://localhost:${PORT}`);
});
