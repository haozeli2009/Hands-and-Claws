import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useChatStore } from '../store/chatStore'

function FlowIcon({ color }) {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
      <rect x="2" y="0.5" width="8" height="3.5" rx="0.8" stroke={color} strokeWidth="1.1" />
      <line x1="6" y1="4" x2="6" y2="6.5" stroke={color} strokeWidth="1.1" />
      <line x1="2.5" y1="6.5" x2="9.5" y2="6.5" stroke={color} strokeWidth="1.1" />
      <line x1="2.5" y1="6.5" x2="2.5" y2="8.5" stroke={color} strokeWidth="1.1" />
      <line x1="9.5" y1="6.5" x2="9.5" y2="8.5" stroke={color} strokeWidth="1.1" />
      <rect x="0" y="8.5" width="5" height="3" rx="0.8" stroke={color} strokeWidth="1.1" />
      <rect x="7" y="8.5" width="5" height="3" rx="0.8" stroke={color} strokeWidth="1.1" />
    </svg>
  )
}

// vPad must match the header's vertical padding so the groove fills the full bar height
export default function WorkflowMonitor({ vPad = 8 }) {
  const T          = useTheme()
  const navigate   = useNavigate()
  const processing = useChatStore(s => s.processing)
  const pipeline   = useChatStore(s => s.pipeline)
  const pipelineRunning = pipeline.some(s => s.status === 'running')
  const isActive        = processing || pipelineRunning
  const sweepDown       = pipelineRunning  // server → browser/openclaw
  // processing && !pipelineRunning → browser/openclaw → server (bottom to top)

  const iconColor  = isActive ? '#22c55e' : T.ink4
  const textColor  = isActive ? '#22c55e' : T.ink4

  return (
    <div
      onClick={() => navigate('/workflow')}
      style={{
        alignSelf: 'stretch',
        margin: `-${vPad}px 0`,
        padding: `${vPad}px 14px`,
        display: 'flex', alignItems: 'center', gap: 7,
        background: T.dark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.04)',
        boxShadow: T.dark
          ? 'inset 0 2px 6px rgba(0,0,0,0.55), inset 0 -2px 6px rgba(0,0,0,0.3)'
          : 'inset 0 2px 6px rgba(0,0,0,0.07), inset 0 -2px 6px rgba(0,0,0,0.04)',
        borderLeft:  `1px solid ${T.line}`,
        borderRight: `1px solid ${T.line}`,
        cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        userSelect: 'none',
        minWidth: 96,
        transition: 'background 0.2s',
      }}
    >
      {isActive ? (
        <div style={{
          position: 'absolute', left: 0, right: 0, height: '55%',
          background: 'linear-gradient(to bottom, transparent, rgba(34,197,94,0.22), transparent)',
          animation: `${sweepDown ? 'grooveSweepDown' : 'grooveSweepUp'} 1.8s ease-in-out infinite`,
          pointerEvents: 'none',
        }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(34,197,94,0.35), transparent 70%)',
          animation: 'grooveBreathe 3.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}
      <FlowIcon color={iconColor} />
      <span style={{ fontSize: 12, color: textColor, fontWeight: 500, letterSpacing: '0.01em' }}>
        workflow
      </span>
    </div>
  )
}
