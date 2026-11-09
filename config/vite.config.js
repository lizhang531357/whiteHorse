import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { THEME } from './theme.config.js'

// 前端开发服务器把 /api 请求转发给 Node 后端（这样 key 不用进前端）
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        // 把主题色注入到所有 less（供 global.less 等自定义样式使用）
        additionalData: `@theme-accent: ${THEME.accent};\n@theme-accent-dark: ${THEME.accentDark};\n`,
        // 统一 antd v4 主题色（构建期 less 变量）
        modifyVars: {
          '@primary-color': THEME.accent,
          '@processing-color': THEME.accent,
        },
      },
    },
  },
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
