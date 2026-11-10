import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { encryptSecret, decryptSecret, isEncrypted } from './crypto.js';

const DB_NAME_RAW = process.env.MYSQL_DATABASE || 'whitehorse';
const DB_NAME = /^[A-Za-z0-9_]+$/.test(DB_NAME_RAW) ? DB_NAME_RAW : 'whitehorse';

const connectionConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  charset: 'utf8mb4',
};

const pool = mysql.createPool({
  ...connectionConfig,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

// 用户 ID：随机 13 位正整数（在 JS 安全整数范围内，避免前端精度丢失）
const USER_ID_MIN = 1_000_000_000_000;
const USER_ID_MAX = 9_999_999_999_999;

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    color VARCHAR(32) NOT NULL DEFAULT '#185fa5',
    avatar LONGTEXT NULL,
    created_at BIGINT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    INDEX idx_sessions_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(80) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    messages LONGTEXT NOT NULL,
    pinned TINYINT(1) NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    INDEX idx_conversations_user (user_id, updated_at),
    CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS user_settings (
    user_id BIGINT PRIMARY KEY,
    model VARCHAR(64) NOT NULL DEFAULT '',
    models TEXT NOT NULL,
    base_url VARCHAR(300) NOT NULL DEFAULT '',
    temperature DOUBLE NOT NULL DEFAULT 0.7,
    system_prompt MEDIUMTEXT NOT NULL,
    api_key TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS files (
    id VARCHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    size BIGINT NOT NULL,
    mime VARCHAR(120) NOT NULL,
    path VARCHAR(512) NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX idx_files_user (user_id),
    CONSTRAINT fk_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS password_resets (
    user_id BIGINT PRIMARY KEY,
    code_hash CHAR(64) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function initDatabase() {
  const bootstrap = await mysql.createConnection(connectionConfig);
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await bootstrap.end();
  }

  for (const sql of TABLES) {
    await pool.query(sql);
  }

  // 把历史明文 API Key 迁移成密文
  const rows = await query("SELECT user_id, api_key FROM user_settings WHERE api_key <> ''");
  for (const row of rows) {
    if (!isEncrypted(row.api_key)) {
      await run('UPDATE user_settings SET api_key = ? WHERE user_id = ?', [
        encryptSecret(row.api_key),
        row.user_id,
      ]);
    }
  }
}

try {
  await initDatabase();
} catch (err) {
  console.error('MySQL 初始化失败：', err.message);
  console.error(
    '请检查 .env 中的 MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE',
  );
  process.exit(1);
}

export async function generateUserId() {
  for (;;) {
    const id = crypto.randomInt(USER_ID_MIN, USER_ID_MAX + 1);
    const existing = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
    if (!existing) return id;
  }
}

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
  return queryOne('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
}

export async function createUser(user) {
  const record = { ...user };
  if (!record.id) record.id = await generateUserId();
  await run(
    'INSERT INTO users (id, name, email, password_hash, color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [record.id, record.name, record.email, record.passwordHash, record.color, record.createdAt],
  );
  return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [record.id]);
}

export async function updateUserProfile(id, name, email) {
  await run('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, id]);
  return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
}

export async function updateUserAvatar(id, avatar) {
  await run('UPDATE users SET avatar = ? WHERE id = ?', [avatar, id]);
  return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
}

export async function createSession(token, userId, ttlMs) {
  const now = Date.now();
  await run(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [token, userId, now, now + ttlMs],
  );
}

export async function getUserBySession(token) {
  if (!token) return null;
  return queryOne(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? LIMIT 1',
    [token, Date.now()],
  );
}

export function deleteSession(token) {
  return run('DELETE FROM sessions WHERE token = ?', [token]);
}

export function cleanupSessions() {
  return run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
}

export async function listConversations(userId) {
  const rows = await query(
    'SELECT id, title, messages, pinned, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC',
    [userId],
  );

  return rows.map((row) => {
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

export async function upsertConversations(userId, conversations) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const conv of conversations) {
      await conn.execute(
        `INSERT INTO conversations (id, user_id, title, messages, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = IF(user_id = VALUES(user_id), VALUES(title), title),
           messages = IF(user_id = VALUES(user_id), VALUES(messages), messages),
           pinned = IF(user_id = VALUES(user_id), VALUES(pinned), pinned),
           updated_at = IF(user_id = VALUES(user_id), VALUES(updated_at), updated_at)`,
        [
          String(conv.id).slice(0, 80),
          userId,
          String(conv.title || '新对话').slice(0, 200),
          JSON.stringify(Array.isArray(conv.messages) ? conv.messages : []),
          conv.pinned ? 1 : 0,
          Number(conv.createdAt) || Date.now(),
          Number(conv.updatedAt) || Date.now(),
        ],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteConversations(userId, ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await run(
    `DELETE FROM conversations WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...ids],
  );
}

export async function getRawSettings(userId) {
  const row = await queryOne('SELECT * FROM user_settings WHERE user_id = ? LIMIT 1', [userId]);
  if (!row) {
    return {
      user_id: userId,
      model: '',
      models: '[]',
      base_url: '',
      temperature: 0.7,
      system_prompt: '',
      api_key: '',
    };
  }
  return { ...row, api_key: decryptSecret(row.api_key) };
}

export function createFileRecord(file) {
  return run(
    'INSERT INTO files (id, user_id, name, size, mime, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [file.id, file.userId, file.name, file.size, file.mime, file.path, Date.now()],
  );
}

export function getFileRecord(id, userId) {
  return queryOne('SELECT * FROM files WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
}

export async function savePasswordReset(userId, codeHash, salt, expiresAt) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM password_resets WHERE user_id = ?', [userId]);
    await conn.execute(
      'INSERT INTO password_resets (user_id, code_hash, salt, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)',
      [userId, codeHash, salt, expiresAt, Date.now()],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export function getPasswordReset(userId) {
  return queryOne('SELECT * FROM password_resets WHERE user_id = ? LIMIT 1', [userId]);
}

export function deletePasswordReset(userId) {
  return run('DELETE FROM password_resets WHERE user_id = ?', [userId]);
}

export function incrementPasswordResetAttempts(userId) {
  return run('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?', [userId]);
}

export function updateUserPassword(userId, passwordHash) {
  return run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

export function deleteUserSessions(userId, keepToken = '') {
  if (keepToken) {
    return run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', [userId, keepToken]);
  }
  return run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

export function deleteUser(userId) {
  return run('DELETE FROM users WHERE id = ?', [userId]);
}

export function deleteAllConversations(userId) {
  return run('DELETE FROM conversations WHERE user_id = ?', [userId]);
}

export function deleteAllFiles(userId) {
  return run('DELETE FROM files WHERE user_id = ?', [userId]);
}

export function normalizeModels(input) {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(input) ? input : []) {
    const value = String(item || '').trim().slice(0, 64);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    list.push(value);
    if (list.length >= 20) break;
  }
  return list;
}

export function parseModels(value) {
  try {
    return normalizeModels(JSON.parse(value || '[]'));
  } catch {
    return [];
  }
}

export async function saveSettings(userId, settings) {
  await run(
    `INSERT INTO user_settings
       (user_id, model, models, base_url, temperature, system_prompt, api_key, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       model = VALUES(model),
       models = VALUES(models),
       base_url = VALUES(base_url),
       temperature = VALUES(temperature),
       system_prompt = VALUES(system_prompt),
       api_key = VALUES(api_key),
       updated_at = VALUES(updated_at)`,
    [
      userId,
      String(settings.model || '').slice(0, 64),
      JSON.stringify(normalizeModels(settings.models)),
      String(settings.baseUrl || '').slice(0, 300),
      Number.isFinite(Number(settings.temperature))
        ? Math.min(2, Math.max(0, Number(settings.temperature)))
        : 0.7,
      String(settings.systemPrompt || '').slice(0, 2000),
      encryptSecret(String(settings.apiKey || '').slice(0, 400)),
      Date.now(),
    ],
  );
  return getRawSettings(userId);
}
