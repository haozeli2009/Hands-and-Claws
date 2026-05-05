import React, { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import Avatar from '../components/Avatar'
import { useTheme } from '../hooks/useTheme'
import { useThemeStore } from '../store/themeStore'
import { useChatStore } from '../store/chatStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTaskStore }  from '../store/taskStore'
import { useHistory }    from '../hooks/useHistory'
import ChatWindow      from '../components/ChatWindow'
import MessageInput    from '../components/MessageInput'
import ConsentDialog   from '../components/ConsentDialog'
import StatusBanner    from '../components/StatusBanner'
import TaskSidebar     from '../components/TaskSidebar'
import GroupChatPanel  from '../components/GroupChatPanel'
import { useGroupChatStore } from '../store/groupChatStore'
import OcOverlay from '../components/OcOverlay'
import WorkflowMonitor from '../components/WorkflowMonitor'
import OperatorDot from '../components/OperatorDot'

const S = {
  page:   { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { display: 'flex', alignItems: 'center',
             padding: '8px 20px', borderBottom: '1px solid #e5e5e5',
             background: '#fff', flexShrink: 0, flexWrap: 'wrap', gap: 8 },
  logo:   { fontWeight: 600, fontSize: 16 },
  meta:   { fontSize: 13, color: '#888', display: 'flex', gap: 12, alignItems: 'center',
             marginLeft: 'auto' },
  btn:    { background: 'none', border: '1px solid #ddd', borderRadius: 6,
             padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#555' },
  content: { flex: 1, display: 'flex', overflow: 'hidden' },
  main:    { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              minWidth: 0 },
}

// ── settings dropdown ─────────────────────────────────────────────────────────
function SettingsMenu({ onNavigate, onLogout, T }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const items = [
    { label: 'Tour',        action: () => onNavigate('/onboarding') },
    { label: 'Profile',     action: () => onNavigate('/profile') },
    { label: 'LLM',         action: () => onNavigate('/llm') },
    { label: 'OpenClaw',    action: () => onNavigate('/integrations') },
    { label: 'OpenClaw CLI',action: () => onNavigate('/cli') },
    { label: 'Workflow',    action: () => onNavigate('/workflow') },
    null,
    { label: 'Sign out',    action: onLogout, danger: true },
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? T.surface2 : 'none',
          border: `1px solid ${T.btnBorder}`, borderRadius: 6,
          padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: T.btnColor,
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Settings
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          minWidth: 150, zIndex: 100, overflow: 'hidden',
        }}>
          {items.map((item, i) =>
            item === null
              ? <div key={i} style={{ height: 1, background: T.line, margin: '4px 0' }} />
              : (
                <button key={item.label} onClick={() => { setOpen(false); item.action() }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 16px', fontSize: 13,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: item.danger ? '#dc2626' : T.ink,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = item.danger ? '#fef2f2' : T.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {item.label}
                </button>
              )
          )}
        </div>
      )}
    </div>
  )
}

// ── status pill ───────────────────────────────────────────────────────────────
const DOT = { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 }

function Pill({ dot, label, title, onClick }) {
  const T      = useTheme()
  const green  = dot === '#22c55e'
  const amber  = dot === '#f59e0b'
  const border = green ? (T.dark ? 'rgba(34,197,94,0.35)'  : '#bbf7d0')
               : amber ? (T.dark ? 'rgba(245,158,11,0.35)' : '#fde68a')
               : T.line
  const bg     = green ? T.greenSoft : amber ? T.amberSoft : T.surface2
  const glow   = green ? '0 0 6px 1px #86efac88'
               : amber ? '0 0 6px 1px #fcd34d88'
               : 'none'
  return (
    <span
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 20,
        border: `1px solid ${border}`,
        background: bg,
        fontSize: 11, color: T.ink3, whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        boxShadow: glow,
        transition: 'box-shadow 0.3s, background 0.3s, border-color 0.3s',
      }}
    >
      <span style={{ ...DOT, background: dot }} />
      {label}
    </span>
  )
}

function StatusBar({ token, T, avail, setAvail, send }) {
  const navigate = useNavigate()
  const [llm,     setLlm]     = useState(null)
  const [toggling, setToggling] = useState(false)
  const oc = useChatStore(s => s.ocMode)   // driven by welcome + openclaw_status push

  useEffect(() => {
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }

    fetch('/api/user/profile', { headers: h })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setAvail(!!d.availability))
      .catch(() => {})

    fetch('/api/user/llm', { headers: h })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        if (!d.enabled)        setLlm('disabled')
        else if (d.configured) setLlm('own')
        else                   setLlm('system')
      })
      .catch(() => {})
  }, [token])

  async function toggleAvail() {
    if (avail === null || toggling) return
    setToggling(true)
    const next = !avail
    setAvail(next)
    try {
      await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ availability: next }),
      })
    } catch { setAvail(!next) }
    setToggling(false)
  }

  const availDot   = avail ? '#22c55e' : '#ccc'
  const availLabel = avail === null ? 'Availability' : avail ? 'Available' : 'Away'
  const availTitle = 'Click to toggle availability'

  const llmDot   = llm === 'own' ? '#22c55e' : '#ccc'
  const llmLabel = llm === 'own' ? 'Own LLM' : 'System LLM'
  const llmTitle = llm === 'own' ? 'Using your own LLM key — click to manage'
                 : llm === 'disabled' ? 'Per-user LLM keys disabled on this server'
                 : 'Using server LLM — click to add your own key'

  const ocDot   = oc === true ? '#22c55e' : oc === 'paused' ? '#f59e0b' : '#ccc'
  const ocLabel = oc === true ? 'OpenClaw Connected' : oc === 'paused' ? 'OpenClaw Paused' : 'OpenClaw'
  const ocTitle = oc === true   ? 'OpenClaw Connected — click to pause'
                : oc === 'paused' ? 'OpenClaw Paused — click to resume'
                : 'OpenClaw not connected — click to set up'

  function handleOcClick() {
    if (oc === true) {
      send({ type: 'openclaw_set_enabled', enabled: false })
    } else if (oc === 'paused') {
      send({ type: 'openclaw_set_enabled', enabled: true })
    } else {
      navigate('/integrations')
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <Pill dot={availDot} label={availLabel} title={availTitle} T={T}
            onClick={toggleAvail} />
      <Pill dot={llmDot} label={llmLabel} title={llmTitle} T={T}
            onClick={() => navigate('/llm')} />
      <Pill dot={ocDot} label={ocLabel} title={ocTitle} T={T}
            onClick={handleOcClick} />
    </div>
  )
}

// ── dark mode toggle ──────────────────────────────────────────────────────────
function DarkToggle() {
  const dark   = useThemeStore(s => s.dark)
  const toggle = useThemeStore(s => s.toggle)
  const T      = useTheme()
  return (
    <button onClick={toggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        background: 'none', border: `1px solid ${T.btnBorder}`, borderRadius: 6,
        padding: '4px 7px', cursor: 'pointer', lineHeight: 0,
        color: T.ink3, display: 'flex', alignItems: 'center',
      }}>
      {dark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const T       = useTheme()
  const navigate  = useNavigate()
  const location  = useLocation()
  const prefill   = location.state?.prefill ?? ''
  const token         = useAuthStore(s => s.token)
  const uid           = useAuthStore(s => s.uid)
  const username      = useAuthStore(s => s.username)
  const avatarVersion = useAuthStore(s => s.avatarVersion)
  const clear         = useAuthStore(s => s.clear)
  const pending       = useChatStore(s => s.pendingConsent)
  const addMsg        = useChatStore(s => s.addMessage)
  const clearPipeline          = useChatStore(s => s.clearPipeline)
  const stopProcessing         = useChatStore(s => s.stopProcessing)
  const addThinkingPlaceholder = useChatStore(s => s.addThinkingPlaceholder)
  const setPendingUserMsgId    = useChatStore(s => s.setPendingUserMsgId)
  const activeCid     = useChatStore(s => s.activeCid)
  const processing    = useChatStore(s => s.processing)
  const pipeline      = useChatStore(s => s.pipeline)
  const isBusy        = processing || pipeline.some(s => s.status === 'running')
  const { send }      = useWebSocket(token)
  const activeRoom    = useGroupChatStore(s => s.activeRoom)
  const [avail, setAvail] = useState(null)
  useHistory(token)

  function sendMessage(text) {
    clearPipeline()
    const id = addMsg('user', text, token, activeCid)
    setPendingUserMsgId(id)
    addThinkingPlaceholder(activeCid)
    send({ type: 'user_message', text })
  }

  function stopMessage() {
    send({ type: 'cancel' })
    stopProcessing()
    addMsg('stopped', null, token, activeCid)
  }

  function handleCommand(name, args = '') {
    const cmdText = args.trim() ? `/${name} ${args.trim()}` : `/${name}`
    addMsg('user', cmdText, token, activeCid)

    if (name === 'info') {
      // Read from local stores — no WS round-trip needed
      const tasks     = useTaskStore.getState().tasks
      const active    = tasks.filter(t => t.status !== 'finished')
      const finished  = tasks.filter(t => t.status === 'finished')
      const busy      = useChatStore.getState().processing ||
                        useChatStore.getState().pipeline.some(s => s.status === 'running')
      const lines = [
        '/info',
        `  uid:      ${uid}`,
        `  username: ${username}`,
      ]
      // Fetch profile info from the server since it's not in the auth store
      fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(p => {
          if (p) {
            const avail = p.availability ? 'available' : 'away'
            lines.push(`  name:     ${p.name || '(none)'}`)
            lines.push(`  bio:      ${p.bio || '(none)'}`)
            lines.push(`  skills:   ${p.skills || '(none)'}`)
            lines.push(`  location: ${p.location || '(none)'}`)
            lines.push(`  avail:    ${avail}`)
          }
          lines.push(`  demand:   ${busy ? 'busy' : 'idle'}`)
          if (active.length) {
            lines.push(`  active tasks (${active.length}):`)
            active.forEach(t => {
              lines.push(`    cid: ${t.card_id}  role=${t.role} status=${t.status || 'active'}`)
              lines.push(`    room_id: ${t.card_id}`)
            })
          } else {
            lines.push(`  tasks:    (none active)`)
          }
          if (finished.length) lines.push(`  finished: ${finished.length} task(s)`)
          addMsg('agent', lines.join('\n'), token, activeCid)
        })
        .catch(() => {
          lines.push(`  demand:   ${busy ? 'busy' : 'idle'}`)
          addMsg('agent', lines.join('\n'), token, activeCid)
        })
      return
    }
    if (name === 'task') {
      const cid = args.trim()
      const tasks = useTaskStore.getState().tasks
      if (cid) {
        const card = tasks.find(t => t.card_id === cid || t.card_id.startsWith(cid))
        if (!card) { addMsg('agent', `Task not found: ${cid}`, token, activeCid); return }
        const intent  = card.intent || card.demand_info?.intent || ''
        const ts      = (card.ts || '').slice(0, 16).replace('T', ' ')
        const ps      = (card.participants || []).map(p => `${p.name || 'uid:' + p.uid} [${p.status || 'active'}]`).join(', ')
        const peers   = (card.peers || []).map(p => `${p.name || 'uid:' + p.uid} [${p.status || 'active'}]`).join(', ')
        const di      = card.demand_info
        const lines   = [`task:${card.card_id.slice(0, 8)}… role=${card.role} status=${card.status || 'active'}`]
        if (intent)   lines.push(`  intent:  ${String(intent).slice(0, 120)}`)
        if (ts)       lines.push(`  created: ${ts}`)
        if (ps)       lines.push(`  supply:  ${ps}`)
        if (di)       lines.push(`  demand:  ${di.name || 'uid:' + di.uid}`)
        if (peers)    lines.push(`  peers:   ${peers}`)
        addMsg('agent', lines.join('\n'), token, activeCid)
      } else {
        if (!tasks.length) { addMsg('agent', 'No tasks.', token, activeCid); return }
        const lines = [`${tasks.length} task(s):`]
        tasks.forEach(t => lines.push(`  ${t.card_id.slice(0, 8)}… role=${t.role} status=${t.status || 'active'}`))
        lines.push('Use /task <cid> for full details.')
        addMsg('agent', lines.join('\n'), token, activeCid)
      }
      return
    }
    if (name === 'getlist') {
      const demand = args.trim()
      if (!demand) {
        addMsg('agent', 'Usage: /getlist <demand>', token, activeCid)
        return
      }
      useChatStore.setState({ activeCid: null })
      clearPipeline()
      setPendingUserMsgId(null)
      send({ type: 'get_list', demand })
      return
    }
    if (name === 'cancel') {
      send({ type: 'cancel' })
      stopProcessing()
      addMsg('stopped', null, token, activeCid)
      return
    }
    if (name === 'finish') {
      const parts = args.trim().split(/\s+/)
      const cid = parts[0]
      if (!cid) { addMsg('agent', 'Usage: /finish <cid>', token, activeCid); return }
      const demand_uid = parts[1] ? parseInt(parts[1], 10) : undefined
      send({ type: 'finish_task', cid, ...(demand_uid ? { demand_uid } : {}) })
      addMsg('agent', `Marked task ${cid.slice(0, 8)}… as finished.`, token, activeCid)
      return
    }
    if (name === 'join') {
      const room_id = args.trim()
      if (!room_id) { addMsg('agent', 'Usage: /join <room_id>', token, activeCid); return }
      send({ type: 'fetch_group', room_id })
      addMsg('agent', `Fetching group chat: ${room_id}`, token, activeCid)
      return
    }
    if (name === 'msg') {
      const spIdx = args.indexOf(' ')
      if (spIdx === -1) { addMsg('agent', 'Usage: /msg <room_id> <text>', token, activeCid); return }
      const room_id = args.slice(0, spIdx).trim()
      const text    = args.slice(spIdx + 1).trim()
      if (!room_id || !text) { addMsg('agent', 'Usage: /msg <room_id> <text>', token, activeCid); return }
      send({ type: 'group_message', room_id, text })
      return
    }
    if (name === 'rate') {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 3) { addMsg('agent', 'Usage: /rate <cid> <uid> <score 1-5> [comment]', token, activeCid); return }
      const [cid, uid_s, score_s, ...rest] = parts
      const rated_uid = parseInt(uid_s, 10)
      const score     = parseInt(score_s, 10)
      if (isNaN(rated_uid) || isNaN(score)) { addMsg('agent', 'Usage: /rate <cid> <uid> <score 1-5> [comment]', token, activeCid); return }
      send({ type: 'submit_rating', cid, rated_uid, score, comment: rest.join(' ') })
      return
    }
    if (name === 'help') {
      addMsg('agent',
        'Commands: /info /task /getlist /cancel /finish /join /msg /rate /new /status /profile /help',
        token, activeCid)
      return
    }
    if (name === 'status') {
      if (avail === null) { addMsg('agent', 'Status not loaded yet — try again.', token, activeCid); return }
      const next = !avail
      setAvail(next)
      fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ availability: next }),
      }).then(r => {
        if (r.ok) addMsg('agent', `Status set to: ${next ? 'available' : 'away'}`, token, activeCid)
        else { setAvail(!next); addMsg('agent', 'Failed to update status.', token, activeCid) }
      }).catch(() => { setAvail(!next); addMsg('agent', 'Could not update status.', token, activeCid) })
      return
    }
    const actions = {
      new:     () => { clearPipeline(); addMsg('agent', 'Starting a new chat…', token, null) },
      profile: () => navigate('/profile'),
    }
    if (actions[name]) { actions[name](); return }
    addMsg('agent', `/${name}: unknown command — type /help for a list`, token, activeCid)
  }

  function logout() { clear(); navigate('/login') }

  return (
    <div style={{ ...S.page, background: T.bg, color: T.ink }}>
      <OcOverlay />
      <header style={{ ...S.header, background: T.surface, borderBottomColor: T.line,
                       position: 'relative', zIndex: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/logo.png" width="22" height="22" alt="" aria-hidden="true" />
          <span style={{ ...S.logo, color: T.ink }}>Hands&amp;Claws</span>
          <SettingsMenu onNavigate={navigate} onLogout={logout} T={T} />
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <StatusBar token={token} T={T} avail={avail} setAvail={setAvail} send={send} />
        </div>

        <WorkflowMonitor vPad={8} />

        <span style={{ ...S.meta, color: T.ink3 }}>
          <DarkToggle />
          <span onClick={() => navigate('/profile')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <Avatar key={avatarVersion} uid={uid} name={username} size={28} v={avatarVersion} />
              <OperatorDot size={12} style={{ position: 'absolute', bottom: -1, right: -1,
                boxShadow: '0 0 0 2px ' + T.surface }} />
            </span>
            <span style={{ fontSize: 13, color: T.ink3 }}>{username}</span>
          </span>
        </span>
      </header>

      <div style={S.content}>
        <GroupChatPanel send={send} />
        <div style={S.main}>
          <StatusBanner />
          <ChatWindow />
          {pending
            ? <ConsentDialog consent={pending} send={send} />
            : <MessageInput onSend={sendMessage} onStop={stopMessage} onCommand={handleCommand} disabled={isBusy} initialText={prefill} />
          }
        </div>
        <TaskSidebar send={send} />
      </div>
    </div>
  )
}
