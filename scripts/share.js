/**
 * 公网分享启动脚本
 * 先构建前端，再启动 3011 生产服务，并开启 Cloudflare Tunnel。
 * Tunnel 地址会写入 data/public-url.txt，供页面「分享」按钮读取。
 * 用法：yarn share
 */
import { spawn } from 'node:child_process'

const run = (command, args, options = {}) =>
  spawn(command, args, { stdio: 'inherit', ...options })

let server = null
let tunnel = null
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
    tunnel?.kill('SIGINT')
  } catch {
    // ignore
  }
  setTimeout(() => process.exit(code), 300)
}

const start = () => {
  server = run('node', ['--env-file=.env', 'backend/server.js'], {
    env: { ...process.env, PORT: '3011' },
  })
  tunnel = run('node', ['scripts/tunnel.js'])

  server.on('error', (err) => {
    console.error('[share] 启动服务端失败：', err.message)
    shutdown(1)
  })
  tunnel.on('error', (err) => {
    console.error('[share] 启动 Tunnel 失败：', err.message)
    shutdown(1)
  })

  server.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`\n[share] 服务端退出（code ${code}）`)
      shutdown(code ?? 1)
    }
  })

  tunnel.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`\n[share] Tunnel 退出（code ${code}）`)
      shutdown(code ?? 1)
    }
  })
}

console.log('[share] 正在构建前端...')
const build = run('yarn', ['build'])

build.on('error', (err) => {
  console.error('[share] 构建启动失败：', err.message)
  process.exit(1)
})

build.on('exit', (code) => {
  if (code !== 0) {
    console.error('[share] 构建失败，已退出')
    process.exit(code ?? 1)
  }
  console.log('[share] 构建完成，正在启动服务端和 Tunnel...')
  start()
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
