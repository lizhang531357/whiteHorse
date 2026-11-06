import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { message } from 'antd'
import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import { useState } from 'react'
import 'highlight.js/styles/github-dark.css'
import styles from './index.module.less'

const extractText = (node) => {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node.props?.children) return extractText(node.props.children)
  return ''
}

const CodeBlock = ({ node, children, ...props }) => {
  const [copied, setCopied] = useState(false)
  const codeEl = Array.isArray(children) ? children[0] : children
  const className = codeEl?.props?.className || ''
  const lang = /language-([\w-]+)/.exec(className)?.[1] || 'code'
  const text = extractText(codeEl)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      message.success('已复制代码')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      message.error('复制失败')
    }
  }

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{lang}</span>
        <button type="button" className={styles.copyBtn} onClick={handleCopy}>
          {copied ? <CheckOutlined /> : <CopyOutlined />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre {...props} className={styles.pre}>
        {children}
      </pre>
    </div>
  )
}

const MarkdownRenderer = ({ content = '' }) => {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: CodeBlock,
          a: ({ node, children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className={styles.tableWrap}>
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
