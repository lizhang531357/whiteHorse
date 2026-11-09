import type { ApiError } from '../types'

interface RequestOptions {
  method?: string
  body?: unknown
}

const request = async (path: string, { method = 'GET', body }: RequestOptions = {}) => {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const type = res.headers.get('content-type') || ''
  const data: any = type.includes('application/json') ? await res.json() : null

  if (!res.ok) {
    const error = new Error(data?.error || `请求失败（${res.status}）`) as ApiError
    error.status = res.status
    error.field = data?.field
    throw error
  }

  return data
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (email: string, password: string) =>
    request('/api/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload: unknown) => request('/api/auth/register', { method: 'POST', body: payload }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: {} }),
  updateProfile: (patch: unknown) => request('/api/auth/profile', { method: 'PUT', body: patch }),
  updateAvatar: (avatar: string) =>
    request('/api/auth/avatar', { method: 'PUT', body: { avatar } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/api/auth/password', {
      method: 'PUT',
      body: { currentPassword, newPassword },
    }),
  forgotPassword: (email: string) =>
    request('/api/auth/forgot', { method: 'POST', body: { email } }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    request('/api/auth/reset', { method: 'POST', body: { email, code, newPassword } }),
  getSettings: () => request('/api/settings'),
  updateSettings: (patch: unknown) => request('/api/settings', { method: 'PUT', body: patch }),
  revealApiKey: () => request('/api/settings/api-key'),
  testConnection: (payload: unknown) =>
    request('/api/settings/test', { method: 'POST', body: payload }),
  deleteAccount: () => request('/api/auth/account', { method: 'DELETE' }),
  getConversations: () => request('/api/conversations'),
  deleteAllConversations: () => request('/api/conversations', { method: 'DELETE' }),
  syncConversations: (payload: unknown) =>
    request('/api/conversations/sync', { method: 'POST', body: payload }),
  generateTitle: (text: string) => request('/api/title', { method: 'POST', body: { text } }),
  getShare: () => request('/api/share'),
}
