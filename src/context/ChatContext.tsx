import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuthContext } from './AuthContext'
import { useConversations } from '../hooks/useConversations'
import { useSettings } from '../hooks/useSettings'
import { useTheme } from '../hooks/useTheme'
import { deriveTitle } from '../utils/title'
import { filesToPayload } from '../utils/file'
import { uid } from '../utils/id'
import { consumeSSE, requestChat } from '../utils/stream'
import { loadJSON, saveJSON } from '../utils/storage'
import { api } from '../utils/api'

const ChatContext = createContext(null)

const HISTORY_LIMIT = 30
const HISTORY_IMAGE_LIMIT = 6

const toHistory = (messages = []) => {
  const usable = messages.filter((m) => {
    if (m.role !== 'user' && m.role !== 'assistant') return false
    if (m.role === 'assistant') return Boolean(m.content)
    return Boolean(m.content || m.promptContent || (m.files || []).some((f) => f.preview))
  })

  const source = usable.slice(-HISTORY_LIMIT)
  const result = new Array(source.length)
  let imageBudget = HISTORY_IMAGE_LIMIT

  for (let i = source.length - 1; i >= 0; i -= 1) {
    const m = source[i]
    if (m.role === 'assistant') {
      result[i] = { role: 'assistant', content: m.content }
      continue
    }

    const text = m.promptContent || m.content || ''
    const images = []
    if (imageBudget > 0) {
      for (const file of m.files || []) {
        if (imageBudget <= 0) break
        if (typeof file.preview === 'string' && file.preview.startsWith('data:image/')) {
          images.push({ type: 'image_url', image_url: { url: file.preview } })
          imageBudget -= 1
        }
      }
    }

    result[i] = images.length
      ? { role: 'user', content: [{ type: 'text', text: text || '（图片）' }, ...images] }
      : { role: 'user', content: text }
  }

  return result.filter(Boolean)
}

export const ChatProvider = ({ children }) => {
  const { user } = useAuthContext()
  const {
    settings,
    updateSettings,
    resetSettings,
    loading: settingsLoading,
    hasApiKey,
    apiKeyMasked,
    saveApiKey,
    clearApiKey,
  } = useSettings(user.id)
  const themeState = useTheme()
  const store = useConversations(user.id)
  const {
    current,
    currentId,
    conversationsRef,
    createConversation,
    renameConversation,
    appendMessages,
    patchMessage,
    deleteMessage,
    truncateFrom,
    truncateAfter,
    touchConversation,
    updateMessageFiles,
  } = store

  const [loading, setLoading] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const loadingRef = useRef(false)
  const abortRef = useRef(null)
  const pendingRef = useRef([])
  const sendMessageRef = useRef(null)

  const draftsKey = `baima:drafts:${user.id}`
  const textDraftsRef = useRef(loadJSON(draftsKey, {}))
  const fileDraftsRef = useRef(new Map())
  const draftSaveTimerRef = useRef(null)

  const scheduleSaveDrafts = useCallback(() => {
    if (draftSaveTimerRef.current) return
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null
      saveJSON(draftsKey, textDraftsRef.current)
    }, 300)
  }, [draftsKey])

  const getDraft = useCallback((key) => {
    const id = key || 'new'
    return {
      text: textDraftsRef.current[id] || '',
      files: fileDraftsRef.current.get(id) || [],
    }
  }, [])

  const setDraft = useCallback(
    (key, draft) => {
      const id = key || 'new'
      if (draft.files) fileDraftsRef.current.set(id, draft.files)
      const text = draft.text || ''
      if (textDraftsRef.current[id] !== text) {
        if (text) textDraftsRef.current[id] = text
        else delete textDraftsRef.current[id]
        scheduleSaveDrafts()
      }
    },
    [scheduleSaveDrafts],
  )

  const clearDraft = useCallback(
    (key) => {
      const id = key || 'new'
      fileDraftsRef.current.delete(id)
      delete textDraftsRef.current[id]
      scheduleSaveDrafts()
    },
    [scheduleSaveDrafts],
  )

  useEffect(() => {
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    }
  }, [])

  const setBusy = useCallback((value) => {
    loadingRef.current = value
    setLoading(value)
  }, [])

  const flushQueue = useCallback(() => {
    if (loadingRef.current) return
    const next = pendingRef.current.shift()
    setPendingCount(pendingRef.current.length)
    if (!next) return
    sendMessageRef.current?.(next)
  }, [])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const maybeAutoTitle = useCallback(
    (convId, answer) => {
      const conv = conversationsRef.current.find((c) => c.id === convId)
      if (!conv) return

      const userMessages = conv.messages.filter((m) => m.role === 'user')
      if (userMessages.length !== 1) return

      const firstUser = userMessages[0]
      const fallbackTitle = deriveTitle(firstUser.content || '', firstUser.files || [])
      if (conv.title !== fallbackTitle) return

      const text = [
        firstUser.content || '',
        (firstUser.files || []).map((f) => f.name).join(' '),
        answer || '',
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000)

      if (!text.trim()) return

      api
        .generateTitle(text)
        .then((data) => {
          const nextTitle = String(data?.title || '').trim()
          if (!nextTitle) return
          const latest = conversationsRef.current.find((c) => c.id === convId)
          if (!latest || latest.title !== fallbackTitle) return
          renameConversation(convId, nextTitle)
        })
        .catch(() => {})
    },
    [conversationsRef, renameConversation],
  )

  const startAssistant = useCallback(
    async ({ convId, history, message, attachments = [], userMsgId }) => {
      const controller = new AbortController()
      abortRef.current = controller
      setBusy(true)

      const aiId = uid('msg')
      appendMessages(convId, [
        {
          id: aiId,
          role: 'assistant',
          content: '',
          reasoning: '',
          createdAt: Date.now(),
          status: 'streaming',
        },
      ])

      let content = ''
      let reasoning = ''
      let streamError = ''
      let rafId = null

      const flush = (patch) => patchMessage(convId, aiId, patch)
      const scheduleFlush = () => {
        if (rafId != null) return
        rafId = requestAnimationFrame(() => {
          rafId = null
          flush({ content, reasoning })
        })
      }

      try {
        const res = await requestChat(
          { message, attachments, history, settings },
          controller.signal,
        )
        const contentType = res.headers.get('content-type') || ''

        if (contentType.includes('application/json')) {
          let data = null
          try {
            data = await res.json()
          } catch {
            data = null
          }
          deleteMessage(convId, aiId)
          appendMessages(convId, [
            { id: uid('msg'), role: 'error', content: data?.error || '请求失败', createdAt: Date.now() },
          ])
          return
        }

        if (!res.ok || !res.body) throw new Error('服务端未返回流式内容')

        await consumeSSE(res, {
          onPrompt: (text) => {
            if (userMsgId) patchMessage(convId, userMsgId, { promptContent: text })
          },
          onReasoning: (delta) => {
            reasoning += delta
            scheduleFlush()
          },
          onDelta: (delta) => {
            content += delta
            scheduleFlush()
          },
          onFiles: (saved) => {
            if (!userMsgId || !Array.isArray(saved)) return
            updateMessageFiles(convId, userMsgId, (files) =>
              files.map((file, index) => {
                const info = saved[index]
                if (!info || !info.id) return file
                return {
                  ...file,
                  id: info.id,
                  size: info.size ?? file.size,
                  type: info.type || file.type,
                }
              }),
            )
          },
          onUsage: (value) => {
            flush({ usage: value })
          },
          onModel: (model) => {
            if (model) patchMessage(convId, aiId, { model })
          },
          onError: (msg) => {
            streamError = msg
          },
        })

        if (rafId != null) {
          cancelAnimationFrame(rafId)
          rafId = null
        }

        if (streamError) {
          if (content || reasoning) {
            flush({ content, reasoning, status: 'error', error: streamError })
          } else {
            deleteMessage(convId, aiId)
            appendMessages(convId, [
              { id: uid('msg'), role: 'error', content: streamError, createdAt: Date.now() },
            ])
          }
          return
        }

        if (!content && !reasoning) {
          deleteMessage(convId, aiId)
          appendMessages(convId, [
            {
              id: uid('msg'),
              role: 'error',
              content: '模型没有返回内容，请稍后重试',
              createdAt: Date.now(),
            },
          ])
          return
        }

        flush({ content, reasoning, status: 'done' })
      } catch (err) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          if (content || reasoning) flush({ content, reasoning, status: 'done' })
          else deleteMessage(convId, aiId)
          return
        }

        if (content || reasoning) {
          flush({ content, reasoning, status: 'error', error: '生成中断：' + err.message })
        } else {
          deleteMessage(convId, aiId)
          appendMessages(convId, [
            {
              id: uid('msg'),
              role: 'error',
              content: '请求失败：' + err.message,
              createdAt: Date.now(),
            },
          ])
        }
      } finally {
        if (rafId != null) cancelAnimationFrame(rafId)
        if (abortRef.current === controller) abortRef.current = null
        setBusy(false)
        touchConversation(convId)
        if (content && !streamError && !controller.signal.aborted) {
          maybeAutoTitle(convId, content)
        }
        flushQueue()
      }
    },
    [
      appendMessages,
      deleteMessage,
      flushQueue,
      maybeAutoTitle,
      patchMessage,
      setBusy,
      settings,
      touchConversation,
      updateMessageFiles,
    ],
  )

  const sendMessage = useCallback(
    async ({ text, files = [] }) => {
      const trimmed = String(text || '').trim()
      if (!trimmed && files.length === 0) return

      // 正在生成时先排队，当前回答结束后自动发送
      if (loadingRef.current) {
        pendingRef.current.push({ text: trimmed, files })
        setPendingCount(pendingRef.current.length)
        return
      }

      let convId = currentId
      let history = []
      const existing = convId ? conversationsRef.current.find((c) => c.id === convId) : null

      if (!existing) {
        convId = createConversation(deriveTitle(trimmed, files))
      } else {
        history = toHistory(existing.messages)
        if (!existing.messages.length) {
          renameConversation(convId, deriveTitle(trimmed, files))
        }
      }

      const userMessage = {
        id: uid('msg'),
        role: 'user',
        content: trimmed,
        files: files.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type,
          preview: f.preview || '',
        })),
        createdAt: Date.now(),
      }
      appendMessages(convId, [userMessage])

      let attachments = []
      if (files.length) {
        try {
          attachments = await filesToPayload(files)
        } catch (err) {
          appendMessages(convId, [
            {
              id: uid('msg'),
              role: 'error',
              content: '附件读取失败：' + err.message,
              createdAt: Date.now(),
            },
          ])
          return
        }
      }

      await startAssistant({
        convId,
        history,
        message: trimmed,
        attachments,
        userMsgId: userMessage.id,
      })
    },
    [
      appendMessages,
      conversationsRef,
      createConversation,
      currentId,
      renameConversation,
      startAssistant,
    ],
  )

  const regenerate = useCallback(
    async (messageId) => {
      if (loadingRef.current) return
      const conv = conversationsRef.current.find((c) => c.id === current?.id)
      if (!conv) return

      const index = conv.messages.findIndex((m) => m.id === messageId)
      if (index < 0) return

      const before = conv.messages.slice(0, index)
      let userIndex = -1
      for (let i = before.length - 1; i >= 0; i -= 1) {
        if (before[i].role === 'user') {
          userIndex = i
          break
        }
      }
      if (userIndex < 0) return

      const lastUser = before[userIndex]
      const history = toHistory(before.slice(0, userIndex))
      // 暂存该消息之后的内容，重新生成完成后恢复，避免丢失后续对话
      const rest = conv.messages.slice(index + 1)
      truncateFrom(conv.id, messageId)
      await startAssistant({
        convId: conv.id,
        history,
        message: lastUser.promptContent || lastUser.content,
        attachments: [],
        userMsgId: lastUser.id,
      })
      if (rest.length) {
        appendMessages(conv.id, rest)
      }
    },
    [conversationsRef, current?.id, appendMessages, startAssistant, truncateFrom],
  )

  const editMessage = useCallback(
    async (messageId, nextContent) => {
      if (loadingRef.current) return
      const text = String(nextContent || '').trim()
      if (!text) return

      const conv = conversationsRef.current.find((c) => c.id === current?.id)
      if (!conv) return

      const index = conv.messages.findIndex((m) => m.id === messageId)
      if (index < 0 || conv.messages[index].role !== 'user') return

      const history = toHistory(conv.messages.slice(0, index))
      patchMessage(conv.id, messageId, { content: text, promptContent: undefined })
      truncateAfter(conv.id, messageId)
      await startAssistant({
        convId: conv.id,
        history,
        message: text,
        attachments: [],
        userMsgId: messageId,
      })
    },
    [conversationsRef, current?.id, patchMessage, startAssistant, truncateAfter],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    pendingRef.current = []
    setPendingCount(0)
  }, [])

  useEffect(() => {
    sendMessageRef.current = sendMessage
  }, [sendMessage])

  const value = {
    user,
    settings,
    updateSettings,
    resetSettings,
    settingsLoading,
    hasApiKey,
    apiKeyMasked,
    saveApiKey,
    clearApiKey,
    ...themeState,
    ...store,
    current,
    loading,
    pendingCount,
    sendMessage,
    regenerate,
    editMessage,
    stop,
    getDraft,
    setDraft,
    clearDraft,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export const useChatContext = () => {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatContext 必须在 ChatProvider 内使用')
  return ctx
}
