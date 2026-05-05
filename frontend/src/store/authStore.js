import { create } from 'zustand'

const stored = (() => {
  try {
    const raw = localStorage.getItem('auth')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
})()

export const useAuthStore = create(set => ({
  token:         stored?.token    ?? null,
  uid:           stored?.uid      ?? null,
  username:      stored?.username ?? null,
  avatarVersion: 0,

  bumpAvatar() { set(s => ({ avatarVersion: s.avatarVersion + 1 })) },

  setAuth(token, uid, username) {
    // If a different user is logging in, wipe the other users' persisted data
    try {
      const prev = JSON.parse(localStorage.getItem('auth') || '{}')
      if (prev.uid && prev.uid !== uid) {
        localStorage.removeItem('chat-store')
        localStorage.removeItem('task-store')
      }
    } catch { /* ignore */ }
    localStorage.setItem('auth', JSON.stringify({ token, uid, username }))
    set({ token, uid, username })
  },

  clear() {
    localStorage.removeItem('auth')
    set({ token: null, uid: null, username: null })
  },
}))
