import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useWebSocket } from '../hooks/useWebSocket'
import WorkflowMonitor from '../components/WorkflowMonitor'

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function relativeTime(isoTs, now) {
  if (!isoTs) return null
  const diff = Math.floor((now - new Date(isoTs).getTime()) / 1000)
  if (diff < 5)  return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function StatusBar({ ocMode, connectedAt, disconnectedAt, lastEventTs, now }) {
  const connected    = ocMode === true
  const paused       = ocMode === 'paused'
  const disconnected = !connected && !paused

  const dot   = connected ? '#22c55e' : paused ? '#f59e0b' : '#555'
  const label = connected ? 'CONNECTED' : paused ? 'PAUSED' : 'DISCONNECTED'
  const since = connected || paused ? connectedAt : disconnectedAt
  const sinceRel = relativeTime(since, now)
  const lastRel  = relativeTime(lastEventTs, now)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '8px 16px',
      borderBottom: '1px solid #21262d',
      background: '#0d1117', flexShrink: 0,
      fontSize: 11,
    }}>
      {/* Big status dot + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{
          width: 9, height: 9, borderRadius: '50%',
          background: dot,
          boxShadow: connected ? '0 0 6px #22c55e88'
                   : paused    ? '0 0 6px #f59e0b88'
                   : 'none',
        }} />
        <span style={{
          fontWeight: 700, letterSpacing: '0.06em',
          color: connected ? '#22c55e' : paused ? '#f59e0b' : '#555',
        }}>
          {label}
        </span>
      </div>

      {/* Since timestamp */}
      {sinceRel && (
        <span style={{ color: '#555' }}>
          {connected || paused ? 'since' : 'disconnected'}{' '}
          <span style={{ color: '#8b949e' }}>
            {since ? new Date(since).toLocaleTimeString() : '?'}
          </span>
          {' '}({sinceRel})
        </span>
      )}

      {/* Last event */}
      <span style={{ color: '#555' }}>
        last event:{' '}
        <span style={{ color: lastRel ? '#8b949e' : '#444' }}>
          {lastRel || 'none'}
        </span>
      </span>

      {/* Guide when disconnected */}
      {disconnected && (
        <span style={{ color: '#444', fontStyle: 'italic' }}>
          — start the OpenClaw gateway to connect
        </span>
      )}
    </div>
  )
}

function CliLine({ entry, idx }) {
  const arrow = entry.direction === 'in' ? '▶' : '◀'
  const color = entry.direction === 'in' ? '#f59e0b' : '#60a5fa'
  const time  = entry.ts ? entry.ts.slice(11, 23) : ''
  const raw   = JSON.stringify(entry.payload, null, 2)
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '4px 0',
      borderTop: idx > 0 ? '1px solid #161b22' : 'none',
    }}>
      <span style={{ color: '#555', fontSize: 10, flexShrink: 0,
                     minWidth: 90, marginTop: 3 }}>{time}</span>
      <span style={{ color: '#555', fontSize: 10, flexShrink: 0,
                     marginTop: 3, minWidth: 28 }}>
        {entry.direction === 'in' ? 'IN ' : 'OUT'}
      </span>
      <span style={{ color, flexShrink: 0, marginTop: 3 }}>{arrow}</span>
      <pre style={{
        color: '#e2e8f0', flex: 1, margin: 0,
        whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11,
        lineHeight: 1.5,
      }}>{raw}</pre>
    </div>
  )
}

function EmptyState({ ocMode }) {
  if (ocMode === true)
    return (
      <div style={{ color: '#555', marginTop: 32, lineHeight: 1.8 }}>
        <div style={{ color: '#22c55e', marginBottom: 6 }}>● Connected</div>
        <div>Waiting for OpenClaw to do something.</div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#444' }}>
          Events will appear here as soon as the plugin sends or receives a message.
        </div>
      </div>
    )
  if (ocMode === 'paused')
    return (
      <div style={{ color: '#555', marginTop: 32, lineHeight: 1.8 }}>
        <div style={{ color: '#f59e0b', marginBottom: 6 }}>● Paused</div>
        <div>Interaction is suspended. Resume from the chat page to see new events.</div>
      </div>
    )
  return (
    <div style={{ color: '#555', marginTop: 32, lineHeight: 1.8 }}>
      <div style={{ marginBottom: 6 }}>○ Not connected</div>
      <div>The OpenClaw gateway is not connected to this account.</div>
      <div style={{ marginTop: 8, fontSize: 11, color: '#444' }}>
        Run <span style={{ color: '#8b949e' }}>openclaw gateway start</span> and ensure
        the plugin is configured with your token.
      </div>
    </div>
  )
}

export default function CliPage() {
  const navigate       = useNavigate()
  const token          = useAuthStore(s => s.token)
  const log            = useChatStore(s => s.ocIoLog)
  const clearLog       = useChatStore(s => s.clearOcIoLog)
  const ocMode         = useChatStore(s => s.ocMode)
  const connectedAt    = useChatStore(s => s.ocConnectedAt)
  const disconnectedAt = useChatStore(s => s.ocDisconnectedAt)
  const lastEventTs    = log.length > 0 ? log[log.length - 1].ts : null
  const now            = useNow()
  const bottomRef      = useRef(null)

  // Keep WS alive so openclaw_io relay events arrive while on this page.
  useWebSocket(token)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0d1117', color: '#e2e8f0',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        borderBottom: '1px solid #21262d',
        background: '#161b22', flexShrink: 0,
      }}>
        <button onClick={() => navigate('/chat')}
          style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6,
                   color: '#8b949e', padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>
          ← Chat
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>Agent Monitor</span>
        <WorkflowMonitor vPad={10} />
        <span style={{ marginLeft: 'auto', color: '#555', fontSize: 11 }}>
          {log.length} event{log.length !== 1 ? 's' : ''}
        </span>
        <button onClick={clearLog}
          style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6,
                   color: '#8b949e', padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>
          Clear
        </button>
      </div>

      {/* Status bar — always visible, updates every second */}
      <StatusBar
        ocMode={ocMode}
        connectedAt={connectedAt}
        disconnectedAt={disconnectedAt}
        lastEventTs={lastEventTs}
        now={now}
      />

      {/* Column headers */}
      <div style={{
        display: 'flex', gap: 10, padding: '4px 16px',
        borderBottom: '1px solid #21262d',
        color: '#444', fontSize: 10, flexShrink: 0,
      }}>
        <span style={{ minWidth: 90 }}>TIME</span>
        <span style={{ minWidth: 28 }}>DIR</span>
        <span style={{ minWidth: 14 }}> </span>
        <span>MESSAGE</span>
      </div>

      {/* Log */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
        {log.length === 0
          ? <EmptyState ocMode={ocMode} />
          : log.map((e, i) => <CliLine key={e.id} entry={e} idx={i} />)
        }
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
