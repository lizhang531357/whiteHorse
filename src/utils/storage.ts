export const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export const saveJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储空间不足或隐私模式，静默忽略
  }
}

export const loadString = (key, fallback = '') => {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : raw
  } catch {
    return fallback
  }
}

export const saveString = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}
