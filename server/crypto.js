import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(dirname, '..', 'data');
const keyFile = path.join(dataDir, '.settings-key');
const PREFIX = 'enc:v1:';

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  if (process.env.SETTINGS_SECRET) {
    cachedKey = crypto.createHash('sha256').update(String(process.env.SETTINGS_SECRET)).digest();
    return cachedKey;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const hex = fs.readFileSync(keyFile, 'utf8').trim();
    if (hex.length === 64) {
      cachedKey = Buffer.from(hex, 'hex');
      return cachedKey;
    }
  } catch {
    // 首次运行，稍后生成
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, key.toString('hex'), { mode: 0o600 });
  cachedKey = key;
  return key;
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(plain) {
  const text = String(plain || '');
  if (!text) return '';
  if (isEncrypted(text)) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(stored) {
  const value = String(stored || '');
  if (!value) return '';
  if (!isEncrypted(value)) return value;

  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}
