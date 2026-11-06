import { useCallback, useEffect, useState } from 'react'
import darkCssUrl from 'antd/dist/antd.dark.css?url'
import { loadString, saveString } from '../utils/storage'

const THEME_KEY = 'baima:theme'
const DARK_LINK_ID = 'baima-antd-dark'

const applyAntdDark = (enabled) => {
  const existing = document.getElementById(DARK_LINK_ID)
  if (enabled && !existing) {
    const link = document.createElement('link')
    link.id = DARK_LINK_ID
    link.rel = 'stylesheet'
    link.href = darkCssUrl
    document.head.appendChild(link)
  } else if (!enabled && existing) {
    existing.remove()
  }
}

export const useTheme = () => {
  const [theme, setTheme] = useState(() => (loadString(THEME_KEY, 'light') === 'dark' ? 'dark' : 'light'))

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    applyAntdDark(theme === 'dark')
    saveString(THEME_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' }
}
