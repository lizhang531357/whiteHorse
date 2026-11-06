const stamp = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

const safeName = (name = 'conversation') => {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'conversation'
}

export const conversationToMarkdown = (conversation) => {
  const lines = [`# ${conversation.title || '对话'}`, '']
  for (const message of conversation.messages || []) {
    if (message.role === 'user') {
      lines.push('## 我', '')
      if (message.files?.length) {
        lines.push(`> 附件：${message.files.map((f) => f.name).join('、')}`, '')
      }
      lines.push(message.content || '', '')
    } else if (message.role === 'assistant') {
      lines.push('## 白马AI', '')
      if (message.reasoning) {
        lines.push('<details><summary>思考过程</summary>', '', message.reasoning, '', '</details>', '')
      }
      lines.push(message.content || '', '')
    } else if (message.role === 'error') {
      lines.push('> 错误：' + (message.content || ''), '')
    }
  }
  return lines.join('\n')
}

export const downloadText = (filename, text, mime = 'text/plain;charset=utf-8') => {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const exportConversation = (conversation, format = 'md') => {
  const name = safeName(conversation.title)
  if (format === 'json') {
    downloadText(`${name}-${stamp()}.json`, JSON.stringify(conversation, null, 2), 'application/json')
    return
  }
  downloadText(`${name}-${stamp()}.md`, conversationToMarkdown(conversation), 'text/markdown;charset=utf-8')
}
