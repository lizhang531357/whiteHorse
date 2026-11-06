import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import {
  publicUser,
  getUserByEmail,
  createUser,
  updateUserProfile,
  createSession,
  deleteSession,
  listConversations,
  upsertConversations,
  deleteConversations,
  getRawSettings,
  saveSettings,
  cleanupSessions,
} from './server/db.js';
import {
  hashPassword,
  verifyPassword,
  createToken,
  getSessionToken,
  getAuthUser,
  setSessionCookie,
  clearSessionCookie,
  SESSION_TTL_MS,
} from './server/auth.js';

const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const PORT = process.env.PORT || 3001;

// 5 个 8MB 附件经 base64 编码后约 53MB，留出余量
const MAX_BODY_BYTES = 60 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ITEM_CHARS = 12000;
const MAX_TOTAL_CHARS = 40000;
const MAX_HISTORY_ITEMS = 30;

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

async function extractBuffer(buffer, name, type = '') {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('文件超过 8MB');
  }

  const ext = extOf(name);
  if (TEXT_EXTS.has(ext) || isTextType(type)) {
    return new TextDecoder('utf-8').decode(buffer);
  }
  if (ext === 'pdf' || type.includes('pdf')) {
    return pdfToText(buffer);
  }
  if (ext === 'docx' || type.includes('wordprocessingml')) {
    return docxToText(buffer);
  }

  const text = buffer.toString('utf8');
  if (!text.includes('\u0000')) return text;
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
  const items = history
    .filter(
      (item) =>
        item &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string' &&
        item.content.trim(),
    )
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({ role: item.role, content: item.content.slice(0, MAX_ITEM_CHARS) }));

  let total = 0;
  const kept = [];
  for (let i = items.length - 1; i >= 0; i -= 1) {
    total += items[i].content.length;
    if (total > MAX_TOTAL_CHARS * 2) break;
    kept.unshift(items[i]);
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

function maskKey(key = '') {
  if (!key) return '';
  if (key.length <= 8) return '••••••';
  return `${key.slice(0, 4)}••••••${key.slice(-4)}`;
}

function settingsView(userId) {
  const settings = getRawSettings(userId);
  return {
    model: settings.model || '',
    temperature: settings.temperature ?? 0.7,
    systemPrompt: settings.system_prompt || '',
    hasApiKey: Boolean(settings.api_key),
    apiKeyMasked: maskKey(settings.api_key),
  };
}

async function handleRegister(req, res) {
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
    id: crypto.randomUUID(),
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

  saveSettings(user.id, {
    model: typeof body.model === 'string' ? body.model : current.model,
    temperature:
      body.temperature === undefined ? current.temperature : Number(body.temperature),
    systemPrompt:
      typeof body.systemPrompt === 'string' ? body.systemPrompt : current.system_prompt,
    apiKey,
  });

  sendJson(res, 200, settingsView(user.id));
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
  const apiKey = (rawSettings.api_key || '').trim();
  if (!apiKey) {
    sendError(res, 400, '请先在「我的 - 系统配置」里填写 API Key');
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
    sendJson(400, { error: '消息和附件不能同时为空' });
    return;
  }

  const attachmentsText = [];
  const urlsText = [];
  const imageUrls = [];
  const warnings = [];

  for (const attachment of attachments) {
    const name = attachment?.name || '未命名附件';
    const type = attachment?.type || '';
    try {
      if (!attachment?.data) throw new Error('文件内容为空');
      const buffer = Buffer.from(attachment.data, 'base64');
      if (buffer.length > MAX_FILE_BYTES) throw new Error('文件超过 8MB');

      if (isImage(name, type)) {
        imageUrls.push(`data:${imageMime(name, type)};base64,${buffer.toString('base64')}`);
        continue;
      }

      const text = await extractBuffer(buffer, name, type);
      attachmentsText.push(`--- 附件：${name} ---\n${truncate(text)}`);
    } catch (err) {
      warnings.push(`附件「${name}」读取失败：${err.message}`);
    }
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

  const requested = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
  const model =
    typeof requested.model === 'string' && requested.model.trim()
      ? requested.model.trim().slice(0, 64)
      : rawSettings.model || MODEL;
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

  const requestBody = { model, stream: true, messages };
  if (!isReasoner) {
    requestBody.temperature = temperature;
  }

  let upstream;
  try {
    upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    sendJson(500, { error: '调用模型失败：' + err.message });
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
      sendJson(200, { error: msg });
    } else {
      sendJson(200, { error: '模型未返回内容：' + JSON.stringify(data) });
    }
    return;
  }

  if (!upstream.body) {
    sendJson(500, { error: '模型没有返回流式内容' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`data: ${JSON.stringify({ type: 'prompt', content: textContent })}\n\n`);

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const { method } = req;

  try {
    if (method === 'GET' && pathname === '/api/config') {
      sendJson(res, 200, {
        defaultModel: MODEL,
        maxFiles: 5,
        maxFileSize: MAX_FILE_BYTES,
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/auth/register') return await handleRegister(req, res);
    if (method === 'POST' && pathname === '/api/auth/login') return await handleLogin(req, res);
    if (method === 'POST' && pathname === '/api/auth/logout') return handleLogout(req, res);
    if (method === 'GET' && pathname === '/api/auth/me') return handleMe(req, res);
    if (method === 'PUT' && pathname === '/api/auth/profile') return await handleProfile(req, res);

    if (method === 'GET' && pathname === '/api/settings') return handleGetSettings(req, res);
    if (method === 'PUT' && pathname === '/api/settings') return await handlePutSettings(req, res);

    if (method === 'GET' && pathname === '/api/conversations') return handleGetConversations(req, res);
    if (method === 'POST' && pathname === '/api/conversations/sync') {
      return await handleSyncConversations(req, res);
    }

    if (method === 'POST' && pathname === '/api/chat') return await handleChat(req, res);

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
