import React, { useEffect, useRef } from 'react'
import { useChatStore } from '../store/chatStore'
import PipelineTracker from './PipelineTracker'
import ArchivedPipeline from './ArchivedPipeline'
import { useTheme } from '../hooks/useTheme'

const bubble = (role, T) => ({
  ...(role === 'user'
    ? { display: 'block' }
    : { width: '100%', display: 'block', boxSizing: 'border-box' }),
  minWidth: '60px',
  padding: '10px 14px',
  borderRadius: role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
  background: role === 'user'   ? '#0070f3'
            : role === 'system' ? (T.dark ? 'rgba(180,83,9,0.18)' : '#fff3cd')
            : role === 'group'  ? (T.dark ? '#0f2a1a' : '#f0faf4')
            : T.surface,
  color: role === 'user'   ? '#fff'
       : role === 'system' ? (T.dark ? '#fbbf24' : '#78350f')
       : T.ink,
  border: role === 'user'   ? 'none'
        : role === 'system' ? `1px solid ${T.dark ? 'rgba(180,83,9,0.35)' : '#f3d98a'}`
        : role === 'group'  ? `1px solid ${T.dark ? '#1a4a2a' : '#bbf7d0'}`
        : `1px solid ${T.line}`,
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
})

const row = (role) => ({
  display: 'flex',
  justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
  marginBottom: role === 'thinking' ? 4 : 10,
})

const dotsKeyframes = `
@keyframes thinking-dot {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40%            { opacity: 1;   transform: scale(1);   }
}
`

const S = {
  wrap: {
    flex: 1, overflowY: 'auto', padding: '20px 20px 8px',
    display: 'flex', flexDirection: 'column',
  },
  ts: { fontSize: 11, color: '#aaa', marginTop: 4, textAlign: 'right' },
}

function fmt(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ThinkingBubble({ text }) {
  const T = useTheme()
  return (
    <div style={{
      background: 'transparent', border: `1px solid ${T.line}`,
      borderRadius: '12px 12px 12px 4px',
      fontSize: 13, overflow: 'hidden', width: '100%', boxSizing: 'border-box',
    }}>
      <style>{dotsKeyframes}</style>
      <div style={{
        padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6,
        color: T.ink3, fontWeight: 600,
      }}>
        <span style={{ fontSize: 13 }}>🧠</span> Agent thinking…
      </div>
      <div style={{
        padding: '6px 12px 10px', borderTop: `1px solid ${T.line}`,
        color: T.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
        minHeight: 28,
      }}>
        {text ? text : (
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', height: 18 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: T.ink3, display: 'inline-block',
                animation: `thinking-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

export default function ChatWindow() {
  const T           = useTheme()
  const allMessages = useChatStore(s => s.messages)
  const pipeline    = useChatStore(s => s.pipeline)
  const activeCid   = useChatStore(s => s.activeCid)
  const newChatAt   = useChatStore(s => s.newChatAt)
  const endRef      = useRef(null)

  // Filter rules:
  //   activeCid = "X"  → show all messages tagged with cid "X" (ignores newChatAt so the full
  //                       task thread is always visible regardless of when "new chat" was pressed);
  //                       uncid'd system messages (e.g. errors) are also shown, cut by newChatAt
  //   activeCid = null, newChatAt = null  → show all cid-less messages (full history)
  //   activeCid = null, newChatAt = "T"  → blank slate: only cid-less messages after T
  //   system role in general view → always visible; only cut by newChatAt
  const messages = allMessages.filter(m => {
    if (activeCid) {
      if (m.cid === activeCid) return true
      if (m.role === 'system' && !m.cid) return !newChatAt || m.ts >= newChatAt
      return false
    }
    if (m.role === 'system') {
      if (m.cid) return false  // belongs to a task thread; shown only when activeCid matches
      return !newChatAt || m.ts >= newChatAt
    }
    if (m.cid) return false
    if (newChatAt) return m.ts >= newChatAt
    return true
  })

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pipeline])

  if (!messages.length && !pipeline.length) {
    return (
      <div style={{ ...S.wrap, backgroundImage: 'none', background: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <img src="/background.png" width={220} height={220} alt="" aria-hidden="true" draggable="false"
          style={{ display: 'block', objectFit: 'contain' }} />
        <span style={{ color: T.ink4, fontSize: 14, marginTop: 12 }}>
          {activeCid ? 'No messages in this task yet' : 'Send a message to get started'}
        </span>
      </div>
    )
  }

  return (
    <div style={{ ...S.wrap, background: T.bg }}>
      {messages.map(m => {
        if (m.role === 'pipeline') {
          return <ArchivedPipeline key={m.id} message={m} />
        }
        if (m.role === 'stopped') {
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 14px', borderRadius: 20,
                background: T.surface2, border: `1px solid ${T.line}`,
                fontSize: 12, color: T.ink4,
              }}>
                <svg width="10" height="10" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                  <rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor" />
                </svg>
                Generation stopped
              </div>
            </div>
          )
        }
        if (m.role === 'task_request') {
          return (
            <div key={m.id} style={row('agent')}>
              <div style={{ width: '100%' }}>
                <div style={{
                  width: '100%', minWidth: 60, boxSizing: 'border-box',
                  padding: '10px 14px',
                  borderRadius: '16px 16px 16px 4px',
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  fontSize: 14, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  display: 'block',
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                    textTransform: 'uppercase', color: '#16a34a',
                    marginBottom: 4,
                  }}>
                    📋 Task request
                  </div>
                  <div style={{ color: '#14532d' }}>{m.text}</div>
                </div>
                <div style={S.ts}>{fmt(m.ts)}</div>
              </div>
            </div>
          )
        }
        return (
          <div key={m.id} style={row(m.role)}>
            {m.role === 'thinking' ? (
              <div style={{ width: '100%' }}>
                <ThinkingBubble text={m.text} />
                <div style={S.ts}>{fmt(m.ts)}</div>
              </div>
            ) : (
              <div style={m.role === 'user' ? { maxWidth: '75%' } : { width: '100%' }}>
                <div style={bubble(m.role, T)}>{m.text}</div>
                <div style={S.ts}>{fmt(m.ts)}</div>
              </div>
            )}
          </div>
        )
      })}
      <PipelineTracker />
      <div ref={endRef} />
    </div>
  )
}
