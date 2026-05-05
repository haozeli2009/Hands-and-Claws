import React from 'react'
import { useChatStore } from '../store/chatStore'
import { useTheme } from '../hooks/useTheme'

export default function StatusBanner() {
  const T           = useTheme()
  const status      = useChatStore(s => s.statusMessage)
  const clearStatus = useChatStore(s => s.clearStatus)

  if (!status) return null

  const textColor = T.dark ? '#4ade80' : '#166534'
  const border    = T.dark ? 'rgba(34,197,94,0.25)' : '#bbf7d0'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 12, padding: '10px 20px',
      background: T.greenSoft, borderBottom: `1px solid ${border}`,
      fontSize: 13, color: textColor, flexShrink: 0,
    }}>
      <span style={{ lineHeight: 1.5, flex: 1 }}>{status.message}</span>
      <button style={{ background: 'none', border: 'none', cursor: 'pointer',
                       color: textColor, fontSize: 18, lineHeight: 1, flexShrink: 0 }}
              onClick={clearStatus} aria-label="Dismiss">×</button>
    </div>
  )
}
