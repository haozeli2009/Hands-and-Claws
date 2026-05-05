import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '../store/chatStore'
import { useTheme } from '../hooks/useTheme'

function CliLine({ entry }) {
  const arrow = entry.direction === 'in' ? '▶' : '◀'
  const color = entry.direction === 'in' ? '#f59e0b' : '#60a5fa'
  const time  = entry.ts ? entry.ts.slice(11, 19) : ''
  const raw   = JSON.stringify(entry.payload)
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                  padding: '2px 0', lineHeight: 1.5 }}>
      <span style={{ color: '#555', fontSize: 10, flexShrink: 0, marginTop: 1 }}>{time}</span>
      <span style={{ color, flexShrink: 0 }}>{arrow}</span>
      <span style={{ color: '#e2e8f0', wordBreak: 'break-all', fontSize: 11 }}>{raw}</span>
    </div>
  )
}

export default function OcOverlay() {
  const T        = useTheme()
  const navigate = useNavigate()
  const ocMode   = useChatStore(s => s.ocMode)
  const log      = useChatStore(s => s.ocIoLog)
  const logRef   = useRef(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  if (ocMode !== true) return null

  const recent = log.slice(-40)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      zIndex: 500,
      background: T.dark
        ? 'rgba(0,0,0,0.45)'
        : 'rgba(255,255,255,0.55)',
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: 12,
        padding: '14px 16px',
        width: 500, maxWidth: '88vw',
        maxHeight: '52vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>
            OpenClaw
          </span>
          <span style={{ fontSize: 11, color: '#8b949e' }}>
            operating — tap the pill to pause
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => navigate('/cli')}
              style={{
                background: 'none', border: '1px solid #30363d', borderRadius: 5,
                color: '#8b949e', padding: '2px 8px', cursor: 'pointer',
                fontSize: 11, lineHeight: 1.4,
              }}>
              ⛶ expand
            </button>
            <div style={{ display: 'flex', gap: 5 }}>
              {['#ff5f57','#febc2e','#28c840'].map(c => (
                <div key={c} style={{
                  width: 10, height: 10, borderRadius: '50%', background: c,
                }} />
              ))}
            </div>
          </div>
        </div>
        <div ref={logRef} style={{
          flex: 1, overflowY: 'auto',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: 12,
        }}>
          {recent.length === 0 ? (
            <span style={{ color: '#555' }}>Waiting for activity…</span>
          ) : (
            recent.map(e => <CliLine key={e.id} entry={e} />)
          )}
        </div>
      </div>
    </div>
  )
}
