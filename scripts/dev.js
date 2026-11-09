/**
 * 本地开发启动脚本
 * 同时启动后端（node --watch，端口 3001）和前端 Vite（端口 3000）。
 * 用法：yarn start
 * Ctrl+C 会同时停止两个进程。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const run = (command, args) => spawn(command, args, { cwd: root, stdio: 'inherit' })

let server = null
let client = null
let shuttingDown = false

const shutdown = (code = 0) => {
  if (shuttingDown) return
  shuttingDown = true
  try {
    server?.kill('SIGINT')
  } catch {
    // ignore
  }
  try {
    client?.kill('SIGINT')
  } catch {
    // ignore
  }
  setTimeout(() => process.exit(code), 300)
}

server = run('node', ['--watch', '--env-file=.env', 'backend/server.js'])
client = run(path.join(root, 'node_modules', '.bin', 'vite'), ['--config', 'config/vite.config.js'])

server.on('error', (err) => {
  console.error('[dev] 启动后端失败：', err.message)
  shutdown(1)
})

client.on('error', (err) => {
  console.error('[dev] 启动前端失败：', err.message)
  shutdown(1)
})

server.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`\n[dev] 后端退出（code ${code}）`)
    shutdown(code ?? 1)
  }
})

client.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`\n[dev] 前端退出（code ${code}）`)
    shutdown(code ?? 1)
  }
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
