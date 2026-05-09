import { useEffect, useRef } from 'react'
import { useChatStore } from '../store/chatStore'
import { useTaskStore } from '../store/taskStore'
import { useAuthStore } from '../store/authStore'

export function useHistory(token) {
  const fetched = useRef(false)

  useEffect(() => {
    if (!token || fetched.current) return
    fetched.current = true

    fetch('/api/history', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (r.status === 401) { useAuthStore.getState().clear(); return null }
        return r.ok ? r.json() : null
      })
      .then(data => {
        if (!data) return
        if (data.messages?.length) {
          const current = useChatStore.getState().messages
          const backendIds = new Set(data.messages.map(m => m.id))
          // Preserve pipeline messages (local-only) and any messages sent
          // while the fetch was in-flight (not yet in backend response).
          const localExtra = current.filter(m =>
            !backendIds.has(m.id) && m.role !== 'thinking' && m.role !== 'stopped'
          )
          const merged = [...data.messages, ...localExtra]
            .sort((a, b) => new Date(a.ts) - new Date(b.ts))
          useChatStore.setState({ messages: merged })
        }
        if (data.tasks?.length) {
          useTaskStore.setState({ tasks: data.tasks })
        }
      })
      .catch(() => {})
  }, [token])
}
