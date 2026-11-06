import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端开发服务器把 /api 请求转发给 Node 后端（这样 key 不用进前端）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          const rest = id.split('node_modules/').pop() || ''
          const pkg = rest.startsWith('@')
            ? rest.split('/').slice(0, 2).join('/')
            : rest.split('/')[0]

          if (['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom'].includes(pkg)) {
            return 'react'
          }

          if (
            pkg === 'antd' ||
            pkg.startsWith('@ant-design') ||
            pkg.startsWith('rc-') ||
            pkg.startsWith('@rc-component')
          ) {
            return 'antd'
          }

          if (
            [
              'react-markdown',
              'remark-gfm',
              'rehype-highlight',
              'highlight.js',
              'lowlight',
              'parse-entities',
              'character-entities',
              'property-information',
              'space-separated-tokens',
              'comma-separated-tokens',
              'style-to-object',
              'trim-lines',
              'decode-named-character-reference',
              'markdown-table',
              'html-url-attributes',
            ].includes(pkg) ||
            /^(remark|rehype|micromark|mdast|hast|unist|unified|vfile)/.test(pkg)
          ) {
            return 'markdown'
          }

          return 'vendor'
        },
      },
    },
  },
})
