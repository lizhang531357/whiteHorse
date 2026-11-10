/**
 * 数据备份脚本
 * 备份 MySQL 数据库、data/uploads 到 backups/（文件名带时间戳）。
 * 用法：yarn backup
 * 需要本机安装 mysqldump（MySQL 客户端）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const backupDir = path.join(root, 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.join(backupDir, `mysql-${stamp}.sql`);
const database = process.env.MYSQL_DATABASE || 'whitehorse';

const result = spawnSync(
  'mysqldump',
  [
    '--host',
    process.env.MYSQL_HOST || '127.0.0.1',
    '--port',
    String(process.env.MYSQL_PORT || 3306),
    '--user',
    process.env.MYSQL_USER || 'root',
    '--single-transaction',
    '--routines',
    '--databases',
    database,
    '--result-file',
    target,
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, MYSQL_PWD: process.env.MYSQL_PASSWORD || '' },
  },
);

if (result.error) {
  console.error('执行 mysqldump 失败：', result.error.message);
  console.error('请先安装 MySQL 客户端（macOS：brew install mysql-client）。');
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`mysqldump 退出码 ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('已备份数据库到', target);

const uploads = path.join(dataDir, 'uploads');
if (fs.existsSync(uploads)) {
  const uploadsTarget = path.join(backupDir, `uploads-${stamp}`);
  fs.cpSync(uploads, uploadsTarget, { recursive: true });
  console.log('已备份附件到', uploadsTarget);
}
