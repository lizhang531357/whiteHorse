/**
 * 数据备份脚本
 * 备份 data/baima.db、data/.settings-key、data/uploads 到 backups/（文件名带时间戳）。
 * 用法：yarn backup
 * 备份含加密密钥，请勿上传到公开仓库或网盘。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const source = path.join(dataDir, 'baima.db');

if (!fs.existsSync(source)) {
  console.error('找不到数据库：', source);
  process.exit(1);
}

const backupDir = path.join(root, 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.join(backupDir, `baima-${stamp}.db`);

const db = new Database(source, { readonly: true, fileMustExist: true });
await db.backup(target);
db.close();
console.log('已备份数据库到', target);

const keyFile = path.join(dataDir, '.settings-key');
if (fs.existsSync(keyFile)) {
  const keyTarget = path.join(backupDir, `.settings-key-${stamp}`);
  fs.copyFileSync(keyFile, keyTarget);
  console.log('已备份加密密钥到', keyTarget);
}

const uploads = path.join(dataDir, 'uploads');
if (fs.existsSync(uploads)) {
  const uploadsTarget = path.join(backupDir, `uploads-${stamp}`);
  fs.cpSync(uploads, uploadsTarget, { recursive: true });
  console.log('已备份附件到', uploadsTarget);
}
