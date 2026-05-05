import React, { useState, useRef } from 'react'
import { useTheme } from '../hooks/useTheme'

const COMMANDS = [
  { name: 'getlist', desc: 'Search candidates — /getlist <demand>' },
  { name: 'info',    desc: 'Your uid, profile, tasks and status' },
  { name: 'task',    desc: 'Task info — /task [cid]' },
  { name: 'cancel',  desc: 'Stop your current demand' },
  { name: 'finish',  desc: 'Mark task finished — /finish <cid>' },
  { name: 'join',    desc: 'Fetch group chat — /join <room_id>' },
  { name: 'msg',     desc: 'Send to group — /msg <room_id> <text>' },
  { name: 'rate',    desc: 'Rate participant — /rate <cid> <uid> <score>' },
  { name: 'new',     desc: 'Start a new chat' },
  { name: 'status',  desc: 'Toggle your availability' },
  { name: 'profile', desc: 'Open your profile' },
  { name: 'help',    desc: 'Show available commands' },
]

function CommandPalette({ query, activeIdx, onSelect, T }) {
  const filtered = COMMANDS.filter(c => c.name.startsWith(query.toLowerCase()))
  if (!filtered.length) return null
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, right: 0,
      marginBottom: 6, zIndex: 200,
      background: T.surface, border: `1px solid ${T.line}`,
      borderRadius: 10, overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }}>
      <div style={{
        padding: '5px 12px 4px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: T.ink4,
        borderBottom: `1px solid ${T.line}`,
      }}>
        Commands
      </div>
      {filtered.map((cmd, i) => (
        <button key={cmd.name}
          onMouseDown={e => e.preventDefault()}
          onClick={() => onSelect(cmd)}
          style={{
            display: 'flex', width: '100%', textAlign: 'left',
            alignItems: 'baseline', gap: 10,
            padding: '8px 14px', border: 'none', cursor: 'pointer',
            background: i === activeIdx ? T.surface2 : 'transparent',
            borderBottom: i < filtered.length - 1 ? `1px solid ${T.line}` : 'none',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13, color: T.ink, fontFamily: 'monospace' }}>
            /{cmd.name}
          </span>
          <span style={{ fontSize: 12, color: T.ink4 }}>{cmd.desc}</span>
        </button>
      ))}
    </div>
  )
}

function cmdList(val) {
  if (!val.startsWith('/') || val.includes(' ')) return null
  const q = val.slice(1).toLowerCase()
  return COMMANDS.filter(c => c.name.startsWith(q))
}

export default function MessageInput({ onSend, onStop, onCommand, disabled = false, initialText = '' }) {
  const T    = useTheme()
  const [text, setText]           = useState(initialText)
  const [activeIdx, setActiveIdx] = useState(0)
  const [dismissed, setDismissed] = useState(false) // palette closed after selection
  const ref          = useRef(null)
  const dismissedRef = useRef(false) // mirror for onKey (avoids stale closure)

  // Palette shows only while actively typing a command (dismissed after pick)
  const matches = cmdList(text)
  const inCmd   = matches !== null && matches.length > 0 && !dismissed

  function clearInput() {
    setText('')
    setActiveIdx(0)
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.focus()
    }
  }

  function send() {
    if (disabled || inCmd) return
    const t = text.trim()
    if (!t) return
    // If text starts with a slash command, execute it instead of sending as chat
    if (t.startsWith('/')) {
      const [cmdPart, ...rest] = t.split(' ')
      const name    = cmdPart.slice(1)
      const args    = rest.join(' ').trim()
      const matched = COMMANDS.find(c => c.name === name)
      if (matched) {
        onCommand?.(matched.name, args)
        clearInput()
        return
      }
    }
    onSend(t)
    clearInput()
  }

  // Fill textarea with selected command and close palette — user confirms with Enter
  function selectCommand(cmd) {
    const filled = `/${cmd.name}`
    setText(filled)
    setDismissed(true)
    dismissedRef.current = true
    setActiveIdx(0)
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.focus()
      setTimeout(() => {
        if (ref.current) ref.current.setSelectionRange(filled.length, filled.length)
      }, 0)
    }
  }

  function onKey(e) {
    // Read the textarea's live DOM value — guaranteed current at keydown time
    const val = ref.current?.value ?? ''
    const list = cmdList(val)

    if (list && list.length && !dismissedRef.current) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(i + 1, list.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectCommand(list[activeIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        clearInput()
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function onInput(e) {
    if (disabled) return
    const val = e.target.value
    setText(val)
    setDismissed(false)
    dismissedRef.current = false
    e.target.style.height = 'auto'
    e.target.style.height = e.target.scrollHeight + 'px'
    setActiveIdx(0)
  }

  const canSend = !disabled && !!text.trim() && !inCmd  // inCmd already false when dismissed

  return (
    <div style={{ position: 'relative' }}>
      {inCmd && (
        <CommandPalette
          query={text.slice(1)}
          activeIdx={activeIdx}
          onSelect={selectCommand}
          T={T}
        />
      )}
      <div style={{
        padding: '12px 16px', borderTop: `1px solid ${T.line}`,
        background: T.surface, flexShrink: 0,
        display: 'flex', gap: 10, alignItems: 'flex-end',
      }}>
        <textarea
          ref={ref}
          rows={1}
          style={{
            flex: 1, resize: 'none', border: `1px solid ${T.inputBorder}`, borderRadius: 10,
            padding: '10px 14px', fontSize: 14, lineHeight: 1.5,
            fontFamily: 'inherit', outline: 'none', maxHeight: 160,
            overflowY: 'auto', transition: 'border-color .15s',
            background: disabled ? T.surface2 : T.inputBg,
            color: disabled ? T.ink4 : T.ink,
            cursor: disabled ? 'not-allowed' : 'text',
          }}
          placeholder={disabled ? 'Processing…' : 'Type a message or / for commands…'}
          value={text}
          onChange={onInput}
          onKeyDown={onKey}
          disabled={disabled}
        />

        {disabled ? (
          <button onClick={onStop} title="Stop"
            style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: '50%',
              background: '#dc2626', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg style={{ width: 14, height: 14, fill: '#fff' }} viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>
        ) : (
          <button onClick={send} disabled={!canSend}
            style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: '50%',
              background: '#0070f3', border: 'none',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: canSend ? 1 : 0.35, transition: 'opacity .15s',
            }}
          >
            <svg style={{ width: 18, height: 18, fill: '#fff' }} viewBox="0 0 24 24">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
