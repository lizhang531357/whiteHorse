import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { encryptSecret, decryptSecret, isEncrypted } from './crypto.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'baima.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// 两个后端实例同时读写时，遇到锁最多等待 5 秒，避免直接报 SQLITE_BUSY
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#185fa5',
    avatar TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    messages TEXT NOT NULL DEFAULT '[]',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    model TEXT NOT NULL DEFAULT '',
    base_url TEXT NOT NULL DEFAULT '',
    temperature REAL NOT NULL DEFAULT 0.7,
    system_prompt TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);

  CREATE TABLE IF NOT EXISTS password_resets (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// 旧库补 base_url 字段
const settingsColumns = db.prepare('PRAGMA table_info(user_settings)').all().map((column) => column.name);
if (!settingsColumns.includes('base_url')) {
  db.exec("ALTER TABLE user_settings ADD COLUMN base_url TEXT NOT NULL DEFAULT ''");
}

// 旧库补会话置顶字段
const conversationColumns = db.prepare('PRAGMA table_info(conversations)').all().map((column) => column.name);
if (!conversationColumns.includes('pinned')) {
  db.exec('ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
}

// 旧库补用户头像字段
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
if (!userColumns.includes('avatar')) {
  db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
}

// 把历史明文 API Key 迁移成密文
try {
  const pending = db.prepare("SELECT user_id, api_key FROM user_settings WHERE api_key <> ''").all();
  const update = db.prepare('UPDATE user_settings SET api_key = ? WHERE user_id = ?');
  for (const row of pending) {
    if (!isEncrypted(row.api_key)) update.run(encryptSecret(row.api_key), row.user_id);
  }
} catch {
  // 迁移失败不影响启动
}

const stmts = {
  insertUser: db.prepare(
    'INSERT INTO users (id, name, email, password_hash, color, created_at) VALUES (@id, @name, @email, @passwordHash, @color, @createdAt)',
  ),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  updateProfile: db.prepare('UPDATE users SET name = @name, email = @email WHERE id = @id'),
  updateAvatar: db.prepare('UPDATE users SET avatar = @avatar WHERE id = @id'),
  insertSession: db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ),
  sessionUser: db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?',
  ),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  listConversations: db.prepare(
    'SELECT id, title, messages, pinned, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC',
  ),
  upsertConversation: db.prepare(`
    INSERT INTO conversations (id, user_id, title, messages, pinned, created_at, updated_at)
    VALUES (@id, @userId, @title, @messages, @pinned, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      messages = excluded.messages,
      pinned = excluded.pinned,
      updated_at = excluded.updated_at
    WHERE conversations.user_id = excluded.user_id
  `),
  getSettings: db.prepare('SELECT * FROM user_settings WHERE user_id = ?'),
  upsertSettings: db.prepare(`
    INSERT INTO user_settings (user_id, model, base_url, temperature, system_prompt, api_key, updated_at)
    VALUES (@userId, @model, @baseUrl, @temperature, @systemPrompt, @apiKey, @updatedAt)
    ON CONFLICT(user_id) DO UPDATE SET
      model = excluded.model,
      base_url = excluded.base_url,
      temperature = excluded.temperature,
      system_prompt = excluded.system_prompt,
      api_key = excluded.api_key,
      updated_at = excluded.updated_at
  `),
};

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    color: row.color,
    avatar: row.avatar || '',
    createdAt: row.created_at,
  };
}

export function getUserByEmail(email) {
  return stmts.userByEmail.get(email);
}

export function createUser(user) {
  stmts.insertUser.run(user);
  return stmts.userById.get(user.id);
}

export function updateUserProfile(id, name, email) {
  stmts.updateProfile.run({ id, name, email });
  return stmts.userById.get(id);
}

export function updateUserAvatar(id, avatar) {
  stmts.updateAvatar.run({ id, avatar });
  return stmts.userById.get(id);
}

export function createSession(token, userId, ttlMs) {
  const now = Date.now();
  stmts.insertSession.run(token, userId, now, now + ttlMs);
}

export function getUserBySession(token) {
  if (!token) return null;
  const user = stmts.sessionUser.get(token, Date.now());
  return user || null;
}

export function deleteSession(token) {
  stmts.deleteSession.run(token);
}

export function cleanupSessions() {
  stmts.deleteExpiredSessions.run(Date.now());
}

export function listConversations(userId) {
  return stmts.listConversations.all(userId).map((row) => {
    let messages = [];
    try {
      messages = JSON.parse(row.messages);
    } catch {
      messages = [];
    }
    return {
      id: row.id,
      title: row.title,
      messages: Array.isArray(messages) ? messages : [],
      pinned: Boolean(row.pinned),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function upsertConversations(userId, conversations) {
  const save = db.transaction((items) => {
    for (const conv of items) {
      stmts.upsertConversation.run({
        id: String(conv.id).slice(0, 80),
        userId,
        title: String(conv.title || '新对话').slice(0, 200),
        messages: JSON.stringify(Array.isArray(conv.messages) ? conv.messages : []),
        pinned: conv.pinned ? 1 : 0,
        createdAt: Number(conv.createdAt) || Date.now(),
        updatedAt: Number(conv.updatedAt) || Date.now(),
      });
    }
  });
  save(conversations);
}

export function deleteConversations(userId, ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM conversations WHERE user_id = ? AND id IN (${placeholders})`).run(
    userId,
    ...ids,
  );
}

export function getRawSettings(userId) {
  const row = stmts.getSettings.get(userId);
  if (!row) {
    return {
      user_id: userId,
      model: '',
      base_url: '',
      temperature: 0.7,
      system_prompt: '',
      api_key: '',
    };
  }
  return { ...row, api_key: decryptSecret(row.api_key) };
}

const insertFile = db.prepare(
  'INSERT INTO files (id, user_id, name, size, mime, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
);
const selectFile = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?');

export function createFileRecord(file) {
  insertFile.run(
    file.id,
    file.userId,
    file.name,
    file.size,
    file.mime,
    file.path,
    Date.now(),
  );
}

export function getFileRecord(id, userId) {
  return selectFile.get(id, userId);
}

const insertPasswordReset = db.prepare(
  'INSERT INTO password_resets (user_id, code_hash, salt, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)',
);
const selectPasswordReset = db.prepare('SELECT * FROM password_resets WHERE user_id = ?');
const deletePasswordResetStmt = db.prepare('DELETE FROM password_resets WHERE user_id = ?');
const incrementResetAttemptsStmt = db.prepare(
  'UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?',
);
const updatePasswordStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const deleteUserSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
const deleteOtherUserSessionsStmt = db.prepare(
  'DELETE FROM sessions WHERE user_id = ? AND token <> ?',
);

export function savePasswordReset(userId, codeHash, salt, expiresAt) {
  const save = db.transaction(() => {
    deletePasswordResetStmt.run(userId);
    insertPasswordReset.run(userId, codeHash, salt, expiresAt, Date.now());
  });
  save();
}

export function getPasswordReset(userId) {
  return selectPasswordReset.get(userId);
}

export function deletePasswordReset(userId) {
  deletePasswordResetStmt.run(userId);
}

export function incrementPasswordResetAttempts(userId) {
  incrementResetAttemptsStmt.run(userId);
}

export function updateUserPassword(userId, passwordHash) {
  updatePasswordStmt.run(passwordHash, userId);
}

export function deleteUserSessions(userId, keepToken = '') {
  if (keepToken) {
    deleteOtherUserSessionsStmt.run(userId, keepToken);
  } else {
    deleteUserSessionsStmt.run(userId);
  }
}

export function deleteUser(userId) {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function deleteAllConversations(userId) {
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
}

export function deleteAllFiles(userId) {
  db.prepare('DELETE FROM files WHERE user_id = ?').run(userId);
}

export function saveSettings(userId, settings) {
  stmts.upsertSettings.run({
    userId,
    model: String(settings.model || '').slice(0, 64),
    baseUrl: String(settings.baseUrl || '').slice(0, 300),
    temperature: Number.isFinite(Number(settings.temperature))
      ? Math.min(2, Math.max(0, Number(settings.temperature)))
      : 0.7,
    systemPrompt: String(settings.systemPrompt || '').slice(0, 2000),
    apiKey: encryptSecret(String(settings.apiKey || '').slice(0, 400)),
    updatedAt: Date.now(),
  });
  return getRawSettings(userId);
}
