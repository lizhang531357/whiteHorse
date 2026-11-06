import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'baima.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#185fa5',
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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    model TEXT NOT NULL DEFAULT '',
    temperature REAL NOT NULL DEFAULT 0.7,
    system_prompt TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );
`);

const stmts = {
  insertUser: db.prepare(
    'INSERT INTO users (id, name, email, password_hash, color, created_at) VALUES (@id, @name, @email, @passwordHash, @color, @createdAt)',
  ),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  updateProfile: db.prepare('UPDATE users SET name = @name, email = @email WHERE id = @id'),
  insertSession: db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ),
  sessionUser: db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?',
  ),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  listConversations: db.prepare(
    'SELECT id, title, messages, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC',
  ),
  upsertConversation: db.prepare(`
    INSERT INTO conversations (id, user_id, title, messages, created_at, updated_at)
    VALUES (@id, @userId, @title, @messages, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      messages = excluded.messages,
      updated_at = excluded.updated_at
    WHERE conversations.user_id = excluded.user_id
  `),
  getSettings: db.prepare('SELECT * FROM user_settings WHERE user_id = ?'),
  upsertSettings: db.prepare(`
    INSERT INTO user_settings (user_id, model, temperature, system_prompt, api_key, updated_at)
    VALUES (@userId, @model, @temperature, @systemPrompt, @apiKey, @updatedAt)
    ON CONFLICT(user_id) DO UPDATE SET
      model = excluded.model,
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
    createdAt: row.created_at,
  };
}

export function getUserByEmail(email) {
  return stmts.userByEmail.get(email);
}

export function getUserById(id) {
  return stmts.userById.get(id);
}

export function createUser(user) {
  stmts.insertUser.run(user);
  return stmts.userById.get(user.id);
}

export function updateUserProfile(id, name, email) {
  stmts.updateProfile.run({ id, name, email });
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
  return (
    stmts.getSettings.get(userId) || {
      user_id: userId,
      model: '',
      temperature: 0.7,
      system_prompt: '',
      api_key: '',
    }
  );
}

export function saveSettings(userId, settings) {
  stmts.upsertSettings.run({
    userId,
    model: String(settings.model || '').slice(0, 64),
    temperature: Number.isFinite(Number(settings.temperature))
      ? Math.min(2, Math.max(0, Number(settings.temperature)))
      : 0.7,
    systemPrompt: String(settings.systemPrompt || '').slice(0, 2000),
    apiKey: String(settings.apiKey || '').slice(0, 400),
    updatedAt: Date.now(),
  });
  return getRawSettings(userId);
}
