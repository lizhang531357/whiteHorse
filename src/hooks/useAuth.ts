import { useCallback, useEffect, useState } from 'react'
import { api } from '../utils/api'

export const useAuth = () => {
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

  const updateAvatar = useCallback(async (avatar) => {
    const data = await api.updateAvatar(avatar)
    setUser(data.user)
    return data.user
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.changePassword(currentPassword, newPassword)
  }, [])

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount()
    setUser(null)
  }, [])

  return {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    updateAvatar,
    changePassword,
    deleteAccount,
  }
}
