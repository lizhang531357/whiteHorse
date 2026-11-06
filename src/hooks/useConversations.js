import { useCallback, useEffect, useRef, useState } from 'react'
import { deriveTitle } from '../utils/title'
import { uid } from '../utils/id'
import { loadJSON, saveJSON } from '../utils/storage'
import { api } from '../utils/api'

export function useConversations(userId) {
  const cacheKey = `baima:conversations:${userId || 'guest'}`
  const currentKey = `${cacheKey}:current`

  const [conversations, setConversations] = useState(() => {
    const cached = loadJSON(cacheKey, [])
    return Array.isArray(cached) ? cached : []
  })
  const [currentId, setCurrentId] = useState(() => loadJSON(currentKey, null))
  const [loaded, setLoaded] = useState(false)

  const conversationsRef = useRef(conversations)
  const savedRef = useRef(new Map())
  const syncEnabledRef = useRef(false)
  const syncTimerRef = useRef(null)

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    saveJSON(cacheKey, conversations)
  }, [cacheKey, conversations])

  useEffect(() => {
    saveJSON(currentKey, currentId)
  }, [currentKey, currentId])

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    savedRef.current = new Map(conversationsRef.current.map((c) => [c.id, c.updatedAt]))

    api
      .getConversations()
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data.conversations) ? data.conversations : []
        savedRef.current = new Map(list.map((c) => [c.id, c.updatedAt]))
        syncEnabledRef.current = true
        setConversations(list)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        syncEnabledRef.current = true
        setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!loaded || !syncEnabledRef.current) return

    const currentIds = new Set(conversations.map((c) => c.id))
    const upserts = conversations.filter((c) => savedRef.current.get(c.id) !== c.updatedAt)
    const deletes = [...savedRef.current.keys()].filter((id) => !currentIds.has(id))

    if (!upserts.length && !deletes.length) return

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null
      api
        .syncConversations({ upserts, deletes })
        .then(() => {
          for (const conv of upserts) savedRef.current.set(conv.id, conv.updatedAt)
          for (const id of deletes) savedRef.current.delete(id)
        })
        .catch(() => {})
    }, 900)
  }, [conversations, loaded])

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [])

  const current = conversations.find((item) => item.id === currentId) || null

  const createConversation = useCallback((title) => {
    const id = uid('conv')
    const now = Date.now()
    const conversation = {
      id,
      title: title || '新对话',
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    setConversations((prev) => [conversation, ...prev])
    setCurrentId(id)
    return id
  }, [])

  const selectConversation = useCallback((id) => {
    setCurrentId(id)
  }, [])

  const renameConversation = useCallback((id, title) => {
    const nextTitle = String(title || '').trim()
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id ? { ...conv, title: nextTitle || '新对话', updatedAt: Date.now() } : conv,
      ),
    )
  }, [])

  const deleteConversation = useCallback((id) => {
    setConversations((prev) => {
      const next = prev.filter((conv) => conv.id !== id)
      setCurrentId((currentValue) => (currentValue === id ? next[0]?.id || null : currentValue))
      return next
    })
  }, [])

  const clearConversations = useCallback(() => {
    setConversations([])
    setCurrentId(null)
  }, [])

  const appendMessages = useCallback((convId, messages) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === convId
          ? {
              ...conv,
              messages: [...conv.messages, ...messages],
              updatedAt: Date.now(),
            }
          : conv,
      ),
    )
  }, [])

  const patchMessage = useCallback((convId, msgId, patch) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === convId
          ? {
              ...conv,
              messages: conv.messages.map((msg) =>
                msg.id === msgId ? { ...msg, ...patch } : msg,
              ),
            }
          : conv,
      ),
    )
  }, [])

  const deleteMessage = useCallback((convId, msgId) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === convId
          ? {
              ...conv,
              messages: conv.messages.filter((msg) => msg.id !== msgId),
              updatedAt: Date.now(),
            }
          : conv,
      ),
    )
  }, [])

  const truncateFrom = useCallback((convId, msgId) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id !== convId) return conv
        const index = conv.messages.findIndex((msg) => msg.id === msgId)
        if (index < 0) return conv
        return {
          ...conv,
          messages: conv.messages.slice(0, index),
          updatedAt: Date.now(),
        }
      }),
    )
  }, [])

  const truncateAfter = useCallback((convId, msgId) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id !== convId) return conv
        const index = conv.messages.findIndex((msg) => msg.id === msgId)
        if (index < 0) return conv
        return {
          ...conv,
          messages: conv.messages.slice(0, index + 1),
          updatedAt: Date.now(),
        }
      }),
    )
  }, [])

  const touchConversation = useCallback((convId) => {
    setConversations((prev) =>
      prev.map((conv) => (conv.id === convId ? { ...conv, updatedAt: Date.now() } : conv)),
    )
  }, [])

  return {
    conversations,
    conversationsRef,
    current,
    currentId,
    loaded,
    createConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    clearConversations,
    appendMessages,
    patchMessage,
    deleteMessage,
    truncateFrom,
    truncateAfter,
    touchConversation,
    deriveTitle,
  }
}
