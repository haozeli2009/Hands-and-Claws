import React, { useState, useEffect, useRef } from 'react'
import { useGroupChatStore } from '../store/groupChatStore'
import { useTaskStore } from '../store/taskStore'
import { useAuthStore } from '../store/authStore'
import { useResizable, resizeHandleStyle, onHandleHoverIn, onHandleHoverOut } from '../hooks/useResizable'
import { useTheme } from '../hooks/useTheme'
import OperatorDot from './OperatorDot'
import { GitHubPostForm } from './GitHubPostForm'

function formatTs(ts) {
  const d = new Date(ts)
  if (isNaN(d)) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return time
  const yd = new Date(now); yd.setDate(now.getDate() - 1)
  if (d.toDateString() === yd.toDateString()) return `Yesterday ${time}`
  const sameYear = d.getFullYear() === now.getFullYear()
  const date = d.toLocaleDateString([], sameYear
    ? { month: 'short', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric' })
  return `${date} ${time}`
}

function formatFullTs(ts) {
  const d = new Date(ts)
  return isNaN(d) ? ts : d.toLocaleString()
}

const EVENT_PREFIX = '__EVENT__:'

function parseEvent(m) {
  if (m.kind) return m.kind
  if (typeof m.text === 'string' && m.text.startsWith(EVENT_PREFIX)) {
    return m.text.slice(EVENT_PREFIX.length)
  }
  return null
}

function EventCard({ username, ts, kind, text }) {
  const T = useTheme()
  const label = kind === 'task_finished'    ? 'marked this task as finished'
    : kind === 'github_review'  ? text?.replace(username + ' ', '') || 'posted a GitHub review'
    : kind === 'github_comment' ? text?.replace(username + ' ', '') || 'posted a GitHub comment'
    : `triggered event: ${kind}`

  const isGh = kind === 'github_review' || kind === 'github_comment'
  const bg     = isGh ? '#f0fdf4' : T.greenSoft
  const border = isGh ? '#bbf7d0' : T.line
  const icon   = isGh ? '🐙' : '✓'
  const iconBg = isGh ? '#166534' : '#22c55e'

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
      <div style={{
        background: bg, border: `1px solid ${border}`,
        borderRadius: 10, padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
        maxWidth: '92%',
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: iconBg, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.35 }}>
            <span style={{ fontWeight: 700 }}>{username}</span>{' '}
            <span>{label}</span>
          </div>
          {ts && (
            <div style={{ fontSize: 9, color: T.ink4, marginTop: 1 }}
                 title={formatFullTs(ts)}>
              {formatTs(ts)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Avatar({ name, size = 24 }) {
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue},55%,60%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: '#fff',
    }}>
      {initials}
    </div>
  )
}

const CARD_STATUS = {
  matching:     { label: 'Matching…',   bg: '#fef9c3', color: '#854d0e', dot: '#f59e0b' },
  matched:      { label: 'In Progress', bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
  active:       { label: 'Active',      bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
  finished:     { label: 'Finished',    bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
  all_finished: { label: 'All Done',    bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
}

function StatusPill({ status }) {
  const s = CARD_STATUS[status] ?? CARD_STATUS.active
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: s.bg, color: s.color, borderRadius: 20,
      padding: '2px 8px', fontSize: 10, fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%',
                     background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

function Stars({ avg, count }) {
  if (!count || count < 1) return null
  const full = Math.round(avg)
  return (
    <span style={{ fontSize: 9, whiteSpace: 'nowrap' }}>
      <span style={{ color: '#f59e0b' }}>{'★'.repeat(full)}</span>
      <span style={{ color: '#d1d5db' }}>{'★'.repeat(5 - full)}</span>
      <span style={{ color: '#9ca3af', marginLeft: 3 }}>
        {Number(avg).toFixed(1)} ({count})
      </span>
    </span>
  )
}

function MemberRow({ name, role, status, isMe, participantType, task, rating_avg, rating_count }) {
  const T = useTheme()
  const finished = status === 'finished'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '6px 0', borderTop: `1px solid ${T.line}`,
      opacity: finished ? 0.6 : 1,
    }}>
      <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
        <Avatar name={name} size={26} />
        <OperatorDot size={10} participantType={isMe ? undefined : (participantType || 'human')}
          style={{ position: 'absolute', bottom: -1, right: -1, boxShadow: '0 0 0 2px ' + T.surface }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: T.ink,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textDecoration: finished ? 'line-through' : 'none',
        }}>
          {name}{isMe && <span style={{ color: T.ink4, fontWeight: 400 }}> (you)</span>}
        </div>
        <div style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>
          {role}{status ? ` · ${status}` : ''}
        </div>
        <Stars avg={rating_avg} count={rating_count} />
        {task && (
          <div style={{
            marginTop: 4, fontSize: 11, color: T.ink3,
            background: T.surface2, border: `1px solid ${T.line}`,
            borderRadius: 6, padding: '4px 7px', lineHeight: 1.4,
            textDecoration: finished ? 'line-through' : 'none',
          }}>
            {task}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoPanel({ task, myUid }) {
  const T = useTheme()
  if (!task) {
    return (
      <div style={{ padding: 14, fontSize: 11, color: T.ink4 }}>
        No task info for this room.
      </div>
    )
  }
  const isDemand = task.role === 'demand'
  const description = task.intent || task.task || '—'

  const members = []
  if (isDemand) {
    members.push({ uid: myUid, name: 'You', role: 'Requester',
                   status: 'active', isMe: true })
    for (const p of task.participants || []) {
      members.push({ uid: p.uid, name: p.name || `user_${p.uid}`,
                     role: 'Worker', status: p.status || 'active',
                     isMe: String(p.uid) === String(myUid),
                     participantType: p.participant_type,
                     task: p.task || '',
                     rating_avg: p.rating_avg, rating_count: p.rating_count })
    }
  } else {
    if (task.demand_info) {
      members.push({ uid: task.demand_info.uid,
                     name: task.demand_info.name || 'Requester',
                     role: 'Requester', status: 'active',
                     isMe: String(task.demand_info.uid) === String(myUid),
                     participantType: task.demand_info.participant_type,
                     rating_avg: task.demand_info.rating_avg,
                     rating_count: task.demand_info.rating_count })
    }
    members.push({ uid: myUid, name: 'You', role: 'Worker',
                   status: task.status === 'finished' ? 'finished' : 'active',
                   isMe: true, task: task.task || '' })
    for (const p of task.peers || []) {
      members.push({ uid: p.uid, name: p.name || `user_${p.uid}`,
                     role: 'Worker', status: p.status || 'active',
                     isMe: String(p.uid) === String(myUid),
                     participantType: p.participant_type,
                     task: p.task || '',
                     rating_avg: p.rating_avg, rating_count: p.rating_count })
    }
  }

  const total    = (task.participants || task.peers || []).length + (isDemand ? 0 : 1)
  const finished = (isDemand
    ? (task.participants || [])
    : (task.peers || [])
  ).filter(p => p.status === 'finished').length + (!isDemand && task.status === 'finished' ? 1 : 0)

  const sectionLabel = {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
    textTransform: 'uppercase', color: T.ink3, marginBottom: 5,
  }

  return (
    <div style={{ padding: '10px 12px', fontSize: 12, color: T.ink, overflowY: 'auto' }}>
      <div style={{ marginBottom: 10 }}>
        <div style={sectionLabel}>Task</div>
        <div style={{ fontSize: 12, lineHeight: 1.45, color: T.ink2 }}>{description}</div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={sectionLabel}>Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatusPill status={task.status} />
          {isDemand && total > 0 && (
            <span style={{ fontSize: 10, color: T.ink4 }}>
              {finished}/{total} finished
            </span>
          )}
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Members · {members.length}</div>
        {members.map((m, i) => <MemberRow key={`${m.uid}-${i}`} {...m} />)}
      </div>
    </div>
  )
}

// ── shared fold button style ──────────────────────────────────────────────────

function FoldBtn({ onClick, title, children, T }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 15, color: T.ink4, padding: '0 3px', flexShrink: 0,
        lineHeight: 1, borderRadius: 4,
        transition: 'color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.color = T.ink}
      onMouseLeave={e => e.currentTarget.style.color = T.ink4}
    >
      {children}
    </button>
  )
}

export default function GroupChatPanel({ send }) {
  const T           = useTheme()
  const activeRoom  = useGroupChatStore(s => s.activeRoom)
  const rooms       = useGroupChatStore(s => s.rooms)
  const closeRoom   = useGroupChatStore(s => s.closeRoom)
  const markRead    = useGroupChatStore(s => s.markRead)
  const tasks       = useTaskStore(s => s.tasks)
  const myUid       = useAuthStore(s => s.uid)
  const [text, setText] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [folded, setFolded] = useState(() => localStorage.getItem('group-chat-folded') === 'true')
  const bottomRef   = useRef(null)
  const { width, startResize } = useResizable({
    initial: 260, min: 200, max: 520,
    storageKey: 'group-chat-width', from: 'right',
  })

  function toggleFold() {
    const next = !folded
    setFolded(next)
    localStorage.setItem('group-chat-folded', next)
  }

  const room    = activeRoom ? (rooms[activeRoom] || { messages: [], unread: 0 }) : null
  const messages = room?.messages || []
  const totalUnread = Object.values(rooms).reduce((sum, r) => sum + (r.unread || 0), 0)

  const task = tasks.find(t => t.card_id === activeRoom)
  const title = task
    ? (task.intent || task.task || 'Group Chat')
    : activeRoom
      ? `Room ${activeRoom.slice(0, 8)}`
      : 'Group Chat'
  const mySubtask = task && task.role === 'supply' ? task.task : ''

  useEffect(() => {
    if (activeRoom) {
      send({ type: 'fetch_group', room_id: activeRoom })
      markRead(activeRoom)
    }
  }, [activeRoom])

  useEffect(() => {
    if (activeRoom && room?.unread > 0) markRead(activeRoom)
  }, [messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function sendMsg() {
    const t = text.trim()
    if (!t || !activeRoom) return
    send({ type: 'group_message', room_id: activeRoom, text: t })
    setText('')
  }

  // ── Folded strip ─────────────────────────────────────────────────────────────
  if (folded) return (
    <div style={{
      width: 28, flexShrink: 0,
      borderRight: `1px solid ${T.line}`,
      background: T.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 10, gap: 6,
    }}>
      <button
        onClick={toggleFold}
        title="Expand group chat"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 16, color: T.ink3, padding: 4, lineHeight: 1,
          position: 'relative', borderRadius: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = T.ink}
        onMouseLeave={e => e.currentTarget.style.color = T.ink3}
      >
        ›
        {totalUnread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 7, height: 7, borderRadius: '50%',
            background: '#ef4444', border: `1.5px solid ${T.bg}`,
          }} />
        )}
      </button>
      <div style={{
        fontSize: 9, color: T.ink4, fontWeight: 700,
        letterSpacing: '0.06em', writingMode: 'vertical-rl',
        textTransform: 'uppercase', userSelect: 'none',
        transform: 'rotate(180deg)',
      }}>
        Chat
      </div>
    </div>
  )

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (!activeRoom) return (
    <div style={{
      width, flexShrink: 0,
      borderRight: `1px solid ${T.line}`,
      background: T.bg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      <div onMouseDown={startResize} style={resizeHandleStyle('right')}
           onMouseEnter={onHandleHoverIn} onMouseLeave={onHandleHoverOut} />
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${T.line}`,
        background: T.surface, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: T.ink3, marginBottom: 3,
            }}>Group Chat</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.ink4 }}>No room selected</div>
          </div>
          <FoldBtn onClick={toggleFold} title="Collapse group chat" T={T}>‹</FoldBtn>
        </div>
      </div>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center',
      }}>
        <div>
          <div style={{ fontSize: 28, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 13, color: T.ink3, fontWeight: 600, marginBottom: 6 }}>
            No group chat open
          </div>
          <div style={{ fontSize: 11, color: T.ink4, lineHeight: 1.6 }}>
            Select a task to start<br />a group chat.
          </div>
        </div>
      </div>
    </div>
  )

  // ── Active room ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      width, flexShrink: 0,
      borderRight: `1px solid ${T.line}`,
      background: T.bg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      <div onMouseDown={startResize} style={resizeHandleStyle('right')}
           onMouseEnter={onHandleHoverIn} onMouseLeave={onHandleHoverOut} />

      {/* Header */}
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${T.line}`,
        background: T.surface, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: T.ink3, marginBottom: 3,
            }}>Group Chat</div>
            <div style={{
              fontSize: 12, fontWeight: 600, color: T.ink,
              lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {title}
            </div>
            {mySubtask && (
              <div style={{
                marginTop: 4, fontSize: 10, color: T.ink3,
                background: T.greenSoft, border: `1px solid ${T.line}`,
                borderRadius: 6, padding: '3px 7px', lineHeight: 1.4,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                <span style={{ fontWeight: 700, color: '#166534' }}>Your task: </span>
                {mySubtask}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowInfo(v => !v)}
            title={showInfo ? 'Hide group info' : 'Show group info'}
            style={{
              background: showInfo ? '#4338ca' : T.surface2,
              border: `1px solid ${showInfo ? '#4338ca' : T.line}`,
              cursor: 'pointer',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              color: showInfo ? '#fff' : T.ink3,
              padding: '3px 8px', flexShrink: 0, lineHeight: 1,
              borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'background 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <span style={{ fontSize: 11 }}>ⓘ</span>
            <span>Info</span>
          </button>
          <FoldBtn onClick={toggleFold} title="Collapse group chat" T={T}>‹</FoldBtn>
          <button onClick={closeRoom} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, color: T.ink4, padding: '0 2px', flexShrink: 0,
            lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div style={{
          borderBottom: `1px solid ${T.line}`, background: T.surface,
          flexShrink: 0, maxHeight: '55%', display: 'flex',
          flexDirection: 'column',
        }}>
          <InfoPanel task={task} myUid={myUid} />
        </div>
      )}

      {/* GitHub post form — supply side only */}
      {task?.role === 'supply' && task?.github_ref && (
        <div style={{ borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
          <GitHubPostForm ref={task.github_ref} cid={task.card_id} />
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 6px', background: T.bg }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center', color: T.ink4, fontSize: 11,
            marginTop: 32, lineHeight: 1.6,
          }}>
            No messages yet.<br />
            <span style={{ fontSize: 10 }}>Be the first to say something.</span>
          </div>
        )}
        {messages.map((m, i) => {
          const isMe = String(m.uid) === String(myUid)
          const event = parseEvent(m)
          if (event) {
            return <EventCard key={m.id || i} username={m.username} ts={m.ts} kind={event} text={m.text} />
          }
          return (
            <div key={m.id || i} style={{
              display: 'flex', gap: 6, marginBottom: 8,
              flexDirection: isMe ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
            }}>
              <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                <Avatar name={m.username} size={24} />
                <OperatorDot size={9} participantType={isMe ? undefined : (m.participant_type || 'human')}
                  style={{ position: 'absolute', bottom: -1, right: -1, boxShadow: '0 0 0 2px ' + T.surface }} />
              </span>
              <div style={{ maxWidth: '78%', minWidth: 0 }}>
                <div style={{
                  fontSize: 10, color: T.ink3,
                  marginBottom: 2, padding: '0 2px',
                  display: 'flex', alignItems: 'baseline', gap: 6,
                  flexDirection: isMe ? 'row-reverse' : 'row',
                }}>
                  <span style={{ fontWeight: 600 }}>{m.username}</span>
                  {m.ts && (
                    <span title={formatFullTs(m.ts)}
                          style={{ fontSize: 9, color: T.ink4, fontWeight: 400 }}>
                      {formatTs(m.ts)}
                    </span>
                  )}
                </div>
                <div style={{
                  padding: '6px 10px', fontSize: 12, lineHeight: 1.45,
                  borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                  background:  isMe ? '#0070f3' : T.surface,
                  color:       isMe ? '#fff'    : T.ink,
                  border:      isMe ? 'none'    : `1px solid ${T.line}`,
                  wordBreak: 'break-word',
                }}>
                  {m.text}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '8px 10px', borderTop: `1px solid ${T.line}`,
        background: T.surface, flexShrink: 0,
        display: 'flex', gap: 6, alignItems: 'flex-end',
      }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() }
          }}
          placeholder="Message group…"
          rows={2}
          style={{
            flex: 1, resize: 'none', border: `1px solid ${T.inputBorder}`,
            borderRadius: 8, padding: '6px 8px', fontSize: 12, lineHeight: 1.4,
            fontFamily: 'Inter, system-ui, sans-serif',
            outline: 'none', background: T.inputBg, color: T.ink,
          }}
        />
        <button onClick={sendMsg} disabled={!text.trim()} style={{
          background: text.trim() ? '#0070f3' : T.surface2,
          color: text.trim() ? '#fff' : T.ink4,
          border: 'none', borderRadius: 8,
          padding: '8px 10px', fontSize: 13, cursor: text.trim() ? 'pointer' : 'default',
          flexShrink: 0, transition: 'background 0.15s',
        }}>
          ↑
        </button>
      </div>
    </div>
  )
}
