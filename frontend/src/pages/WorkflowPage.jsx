import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useWebSocket } from '../hooks/useWebSocket'
import Avatar from '../components/Avatar'
import WorkflowMonitor from '../components/WorkflowMonitor'
import OperatorDot from '../components/OperatorDot'

const DIAGRAM_W      = 340
const TERM_W         = (DIAGRAM_W - 16) / 2
const INNER_TERM_W   = (DIAGRAM_W - 32 - 12) / 2   // inside Operator card padding

function mkS(T) {
  return {
    page:    { background: T.bg, minHeight: '100vh', color: T.ink },
    hdr:     { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px',
               background: T.surface, borderBottom: `1px solid ${T.line}` },
    back:    { background: 'none', border: `1px solid ${T.btnBorder}`, borderRadius: 6,
               padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: T.btnColor },
    h1:      { fontSize: 15, fontWeight: 600, color: T.ink },
    badge:   { fontSize: 11, color: T.ink4, padding: '2px 8px', borderRadius: 4,
               background: T.surface2, border: `1px solid ${T.line}` },
    content: { display: 'flex', justifyContent: 'center', padding: '40px 24px' },
    label:   { fontSize: 11, color: T.ink4, textTransform: 'uppercase',
               letterSpacing: '0.08em', marginBottom: 18, textAlign: 'center' },
  }
}

// ── Node card ─────────────────────────────────────────────────────────────────
function Node({ T, title, headerRight, children, width = DIAGRAM_W, faded = false, dimmed = false, onClick }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => onClick && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width, boxSizing: 'border-box',
        background: hovered ? T.surface2 : T.surface,
        border: `1px solid ${hovered ? T.btnBorder : T.line}`,
        borderRadius: 8, padding: '12px 16px',
        opacity: faded ? 0.4 : dimmed ? 0.55 : 1,
        transition: 'opacity 0.2s, background 0.15s, border-color 0.15s',
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: children ? 10 : 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{title}</span>
        {headerRight}
      </div>
      {children}
    </div>
  )
}

// ── Sub-node (inside a container card) ───────────────────────────────────────
function SubNode({ T, title, children, faded = false, dimmed = false, onClick }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => onClick && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, boxSizing: 'border-box',
        background: hovered ? T.surface2 : T.bg,
        border: `1px solid ${hovered ? T.btnBorder : T.line}`,
        borderRadius: 6, padding: '10px 12px',
        opacity: faded ? 0.4 : dimmed ? 0.55 : 1,
        transition: 'opacity 0.2s, background 0.15s, border-color 0.15s',
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: children ? 7 : 0 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ── Vertical arrow ────────────────────────────────────────────────────────────
function Arrow({ T }) {
  const col = T.line
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: DIAGRAM_W }}>
      <div style={{ width: 1, height: 16, background: col }} />
      <svg width="8" height="6" viewBox="0 0 8 6" style={{ display: 'block' }}>
        <polygon points="0,0 8,0 4,6" fill={col} />
      </svg>
    </div>
  )
}

// ── Fork connector ────────────────────────────────────────────────────────────
function Fork({ T, onSwap, canSwap }) {
  const col = T.line
  const lx = INNER_TERM_W / 2 + 16                    // center of left sub-node (incl outer padding)
  const rx = DIAGRAM_W - INNER_TERM_W / 2 - 16        // center of right sub-node
  const cx = DIAGRAM_W / 2
  const bY = 36, stemH = 52

  return (
    <div style={{ position: 'relative', width: DIAGRAM_W, height: stemH + 6, flexShrink: 0 }}>
      <svg width={DIAGRAM_W} height={stemH + 6} style={{ display: 'block', overflow: 'visible' }}>
        <line x1={cx} y1={0}   x2={cx} y2={bY}    stroke={col} strokeWidth={1} />
        <line x1={lx} y1={bY}  x2={rx} y2={bY}    stroke={col} strokeWidth={1} />
        <line x1={lx} y1={bY}  x2={lx} y2={stemH} stroke={col} strokeWidth={1} />
        <line x1={rx} y1={bY}  x2={rx} y2={stemH} stroke={col} strokeWidth={1} />
        <polygon points={`${lx-4},${stemH} ${lx+4},${stemH} ${lx},${stemH+6}`} fill={col} />
        <polygon points={`${rx-4},${stemH} ${rx+4},${stemH} ${rx},${stemH+6}`} fill={col} />
      </svg>
      <button
        onClick={canSwap ? onSwap : undefined}
        title={canSwap ? 'Switch permission' : 'OpenClaw not connected'}
        style={{
          position: 'absolute',
          left: cx, top: bY,
          transform: 'translate(-50%, -50%)',
          width: 30, height: 30,
          borderRadius: '50%',
          border: `1px solid ${T.line}`,
          background: T.surface,
          color: canSwap ? T.ink3 : T.ink4,
          cursor: canSwap ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, lineHeight: 1, padding: 0,
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        }}
      >
        ⇄
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WorkflowPage() {
  const T            = useTheme()
  const S            = mkS(T)
  const navigate     = useNavigate()
  const token        = useAuthStore(s => s.token)
  const uid          = useAuthStore(s => s.uid)
  const username     = useAuthStore(s => s.username)
  const avatarVersion= useAuthStore(s => s.avatarVersion)
  const ocMode          = useChatStore(s => s.ocMode)
  const ocConnectedAt   = useChatStore(s => s.ocConnectedAt)
  const ocDisconnectedAt= useChatStore(s => s.ocDisconnectedAt)
  const { send }        = useWebSocket(token)
  const [llm, setLlm]   = useState(null)

  useEffect(() => {
    if (!token) return
    fetch('/api/user/llm', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        if (!d.enabled)        setLlm('disabled')
        else if (d.configured) setLlm('own')
        else                   setLlm('system')
      })
      .catch(() => {})
  }, [token])

  const ocActive      = ocMode === true
  const ocConnected   = ocMode === true || ocMode === 'paused'
  const browserActive = !ocActive

  function handleSwap() {
    if (ocMode === true)     send({ type: 'openclaw_set_enabled', enabled: false })
    else if (ocMode === 'paused') send({ type: 'openclaw_set_enabled', enabled: true })
  }

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button style={S.back} onClick={() => navigate('/chat')}>← Chat</button>
        <span style={S.h1}>Workflow Config</span>
        <WorkflowMonitor vPad={12} />
      </div>

      <div style={S.content}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={S.label}>system architecture</div>

          {/* Orchestrator */}
          <Node T={T} title="Orchestrator" onClick={() => navigate('/llm')} />

          <Arrow T={T} />

          {/* Delegate — shows LLM state */}
          <Node T={T} title="Delegate" onClick={() => navigate('/llm')}>
            {llm && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: llm === 'own' ? '#22c55e' : '#8b949e',
                }} />
                <span style={{ fontSize: 11, color: T.ink3 }}>
                  {llm === 'own' ? 'own LLM' : llm === 'disabled' ? 'LLM disabled' : 'system LLM'}
                </span>
              </div>
            )}
          </Node>

          <Arrow T={T} />

          {/* Account — shows avatar + username + active operator status */}
          <Node T={T} title="Account" onClick={() => navigate('/profile')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                <Avatar uid={uid} name={username} size={28} v={avatarVersion} />
                <OperatorDot size={12} style={{ position: 'absolute', bottom: -1, right: -1,
                  boxShadow: '0 0 0 2px ' + T.surface }} />
              </span>
              <span style={{ fontSize: 12, color: T.ink2 }}>{username}</span>
            </div>
          </Node>

          <Arrow T={T} />

          {/* Operator container card */}
          <Node T={T} title="Operator" headerRight={
            <button
              onClick={e => { e.stopPropagation(); if (ocConnected) handleSwap() }}
              title={ocConnected ? 'Switch permission' : 'OpenClaw not connected'}
              style={{
                background: 'none', border: `1px solid ${T.line}`, borderRadius: '50%',
                width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, cursor: ocConnected ? 'pointer' : 'not-allowed',
                color: ocConnected ? T.ink3 : T.ink4, padding: 0, flexShrink: 0,
              }}>⇄</button>
          }>
            <div style={{ display: 'flex', gap: 12 }}>
              <SubNode T={T} title="Browser" faded={!browserActive}
                       onClick={() => navigate('/chat')}>
                {browserActive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                    <span style={{ fontSize: 11, color: T.ink4 }}>active</span>
                  </div>
                )}
              </SubNode>
              <SubNode T={T} title="OpenClaw" faded={!ocConnected} dimmed={ocMode === 'paused'}
                       onClick={() => navigate('/integrations')}>
                {(() => {
                  const dot   = ocMode === true ? '#22c55e' : ocMode === 'paused' ? '#f59e0b' : '#8b949e'
                  const label = ocMode === true ? 'connected' : ocMode === 'paused' ? 'paused' : 'disconnected'
                  const ts    = ocMode !== false ? ocConnectedAt : ocDisconnectedAt
                  const time  = ts ? new Date(ts).toLocaleTimeString() : null
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: T.ink4 }}>{label}</span>
                      </div>
                      {time && (
                        <span style={{ fontSize: 10, color: T.ink4 }}>
                          {ocMode !== false ? 'since' : 'at'} {time}
                        </span>
                      )}
                    </div>
                  )
                })()}
              </SubNode>
            </div>
          </Node>

        </div>
      </div>
    </div>
  )
}
