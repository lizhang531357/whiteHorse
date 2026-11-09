import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS } from '../constants'
import { api } from '../utils/api'

export const useSettings = (userId) => {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS })
  const [apiKeyState, setApiKeyState] = useState({ hasApiKey: false, apiKeyMasked: '' })
  const [loading, setLoading] = useState(true)
  const saveTimerRef = useRef(null)

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    setLoading(true)

    api
      .getSettings()
      .then((data) => {
        if (cancelled) return
        setSettings({
          model: data.model || '',
          baseUrl: data.baseUrl || '',
          temperature: Number.isFinite(Number(data.temperature)) ? Number(data.temperature) : 0.7,
          systemPrompt: data.systemPrompt || DEFAULT_SETTINGS.systemPrompt,
        })
        setApiKeyState({
          hasApiKey: Boolean(data.hasApiKey),
          apiKeyMasked: data.apiKeyMasked || '',
        })
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const persist = useCallback(
    (next) => {
      if (!userId) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        api
          .updateSettings({
            model: next.model,
            baseUrl: next.baseUrl,
            temperature: next.temperature,
            systemPrompt: next.systemPrompt,
          })
          .catch(() => {})
      }, 600)
    },
    [userId],
  )

  const updateSettings = useCallback(
    (patch) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS })
    persist({ ...DEFAULT_SETTINGS })
  }, [persist])

  const saveApiKey = useCallback(async (apiKey) => {
    const data = await api.updateSettings({ apiKey })
    setApiKeyState({
      hasApiKey: Boolean(data.hasApiKey),
      apiKeyMasked: data.apiKeyMasked || '',
    })
    return data
  }, [])

  const clearApiKey = useCallback(async () => {
    const data = await api.updateSettings({ clearApiKey: true })
    setApiKeyState({ hasApiKey: false, apiKeyMasked: '' })
    return data
  }, [])

  return {
    settings,
    updateSettings,
    resetSettings,
    loading,
    ...apiKeyState,
    saveApiKey,
    clearApiKey,
  }
}
