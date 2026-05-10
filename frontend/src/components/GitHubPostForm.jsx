import React, { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../hooks/useTheme'

const GH_ICON = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
  </svg>
)

export function GitHubPostForm({ ref: ghRef, cid, compact = false }) {
  const T       = useAuthStore(s => s.token)
  const theme   = useTheme()
  const [open, setOpen]     = useState(false)
  const [body, setBody]     = useState('')
  const [event, setEvent]   = useState('COMMENT')
  const [status, setStatus] = useState(null) // null | 'sending' | 'ok' | 'err'

  const isPr = ghRef.type === 'pr'

  async function submit() {
    if (!body.trim() || status === 'sending') return
    setStatus('sending')
    try {
      const res = await fetch('/api/github/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${T}` },
        body: JSON.stringify({
          cid,
          action: isPr ? 'post_pr_review' : 'post_issue_comment',
          owner:  ghRef.owner,
          repo:   ghRef.repo,
          number: ghRef.number,
          body:   body.trim(),
          event,
        }),
      })
      if (!res.ok) throw new Error()
      setStatus('ok')
      setBody('')
      setTimeout(() => { setStatus(null); setOpen(false) }, 2000)
    } catch {
      setStatus('err')
      setTimeout(() => setStatus(null), 3000)
    }
  }

  const label = isPr ? 'PR' : 'Issue'
  const refLabel = `${isPr ? 'PR' : '#'}${ghRef.number} · ${ghRef.owner}/${ghRef.repo}`

  return (
    <div style={{ background: theme.surface }}>
      {/* Badge row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: compact ? '6px 12px' : '8px 12px',
      }}>
        <a
          href={ghRef.url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px',
            background: '#24292f', borderRadius: 6,
            textDecoration: 'none', fontSize: 11, color: '#94a3b8',
            border: '1px solid #30363d', flexShrink: 0,
          }}
        >
          <span style={{ color: '#94a3b8' }}>{GH_ICON}</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{refLabel}</span>
        </a>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            marginLeft: 'auto',
            background: open ? '#24292f' : theme.surface2,
            color: open ? '#e2e8f0' : theme.ink3,
            border: `1px solid ${open ? '#30363d' : theme.line}`,
            borderRadius: 6, padding: '3px 9px',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {GH_ICON}
          Post to {label}
        </button>
      </div>

      {/* Expandable form */}
      {open && (
        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isPr && (
            <div style={{ display: 'flex', gap: 6 }}>
              {['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].map(e => (
                <button
                  key={e}
                  onClick={() => setEvent(e)}
                  style={{
                    flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 600,
                    borderRadius: 6, cursor: 'pointer', border: `1px solid ${theme.line}`,
                    background: event === e ? '#24292f' : theme.surface2,
                    color: event === e ? '#e2e8f0' : theme.ink3,
                  }}
                >
                  {e === 'REQUEST_CHANGES' ? 'Request changes' : e.charAt(0) + e.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={`Write a ${isPr ? 'review' : 'comment'}…`}
            rows={3}
            style={{
              resize: 'vertical', border: `1px solid ${theme.inputBorder}`,
              borderRadius: 7, padding: '6px 8px', fontSize: 12, lineHeight: 1.4,
              fontFamily: 'Inter, system-ui, sans-serif',
              outline: 'none', background: theme.inputBg, color: theme.ink,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={submit}
              disabled={!body.trim() || status === 'sending'}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 600,
                background: status === 'ok' ? '#22c55e' : status === 'err' ? '#ef4444' : '#24292f',
                color: '#fff', border: 'none', borderRadius: 6,
                cursor: body.trim() && status !== 'sending' ? 'pointer' : 'default',
                opacity: !body.trim() || status === 'sending' ? 0.6 : 1,
              }}
            >
              {status === 'sending' ? 'Posting…'
                : status === 'ok'  ? 'Posted ✓'
                : status === 'err' ? 'Failed'
                : 'Post'}
            </button>
            <button
              onClick={() => { setOpen(false); setBody(''); setStatus(null) }}
              style={{
                background: 'none', border: 'none', fontSize: 12,
                color: theme.ink4, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
