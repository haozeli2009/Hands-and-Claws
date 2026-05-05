import { create } from 'zustand'

const saved = localStorage.getItem('theme') === 'dark'

export const useThemeStore = create(set => ({
  dark: saved,
  toggle() {
    set(s => {
      const next = !s.dark
      localStorage.setItem('theme', next ? 'dark' : 'light')
      document.documentElement.setAttribute('data-dark', next ? '1' : '')
      return { dark: next }
    })
  },
}))

// Apply on load
document.documentElement.setAttribute('data-dark', saved ? '1' : '')
