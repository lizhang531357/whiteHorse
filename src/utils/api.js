async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const type = res.headers.get('content-type') || ''
  const data = type.includes('application/json') ? await res.json() : null

  if (!res.ok) {
    const error = new Error(data?.error || `请求失败（${res.status}）`)
    error.status = res.status
    error.field = data?.field
    throw error
  }

  return data
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: {} }),
  updateProfile: (patch) => request('/api/auth/profile', { method: 'PUT', body: patch }),
  getSettings: () => request('/api/settings'),
  updateSettings: (patch) => request('/api/settings', { method: 'PUT', body: patch }),
  getConversations: () => request('/api/conversations'),
  syncConversations: (payload) => request('/api/conversations/sync', { method: 'POST', body: payload }),
}
