interface SSEHandlers {
  onDelta?: (delta: string) => void
  onReasoning?: (delta: string) => void
  onPrompt?: (content: string) => void
  onFiles?: (files: any[]) => void
  onUsage?: (usage: any) => void
  onModel?: (model: string) => void
  onError?: (message: string) => void
}

export const consumeSSE = async (response: Response, handlers: SSEHandlers = {}) => {
  const { onDelta, onReasoning, onPrompt, onFiles, onUsage, onModel, onError } = handlers

  if (!response.body) throw new Error('服务端未返回流式内容')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n')

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        let json
        try {
          json = JSON.parse(payload)
        } catch {
          continue
        }

        if (json.type === 'prompt') {
          onPrompt?.(json.content)
          continue
        }

        if (json.type === 'files') {
          onFiles?.(json.files || [])
          continue
        }

        if (json.type === 'model') {
          onModel?.(String(json.model || ''))
          continue
        }

        if (json.usage) onUsage?.(json.usage)

        if (json.error) {
          const message =
            typeof json.error === 'string'
              ? json.error
              : json.error.message || JSON.stringify(json.error)
          onError?.(message)
          continue
        }

        const delta = json.choices?.[0]?.delta
        if (!delta) continue
        if (delta.reasoning_content) onReasoning?.(delta.reasoning_content)
        if (delta.content) onDelta?.(delta.content)
      }

      boundary = buffer.indexOf('\n\n')
    }
  }
}

export const requestChat = async (payload: unknown, signal?: AbortSignal) => {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
}
