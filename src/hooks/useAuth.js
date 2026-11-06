import { useCallback, useEffect, useState } from 'react'
import { api } from '../utils/api'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((data) => {
        if (!cancelled) setUser(data.user)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    const data = await api.register(payload)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const updateProfile = useCallback(async (patch) => {
    const data = await api.updateProfile(patch)
    setUser(data.user)
    return data.user
  }, [])

  return { user, loading, login, register, logout, updateProfile }
}
