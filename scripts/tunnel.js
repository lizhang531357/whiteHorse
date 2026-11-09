/**
 * Cloudflare Tunnel 启动脚本（由 share.js 调用，一般不用单独运行）
 * 启动 cloudflared 指向 http://localhost:3011，解析公网地址并写入 data/public-url.txt。
 * 退出时会删除 data/public-url.txt。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.DATA_DIR || path.join(root, 'data')
const urlFile = path.join(dataDir, 'public-url.txt')
fs.mkdirSync(dataDir, { recursive: true })

const child = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3011', '--no-autoupdate'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})

let found = false

const handleOutput = (chunk, stream = process.stdout) => {
  const text = chunk.toString()
  stream.write(text)
  if (found) return

  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
  if (!match) return

  found = true
  fs.writeFileSync(urlFile, match[0])
  console.log(`\n[share] 公网地址：${match[0]}`)
  console.log(`[share] 已写入 ${urlFile}，页面里的「分享」按钮会读取它。`)
}

child.stdout.on('data', (chunk) => handleOutput(chunk, process.stdout))
child.stderr.on('data', (chunk) => handleOutput(chunk, process.stderr))

child.on('error', (err) => {
  console.error('启动 cloudflared 失败：', err.message)
  console.error('请先安装：brew install cloudflared')
  process.exit(1)
})

const cleanup = () => {
  try {
    fs.unlinkSync(urlFile)
  } catch {
    // 文件可能不存在
  }
}

child.on('exit', (code) => {
  cleanup()
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  cleanup()
  child.kill('SIGINT')
})

process.on('SIGTERM', () => {
  cleanup()
  child.kill('SIGTERM')
})
