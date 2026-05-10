import React, { useState } from 'react'
import { useTaskStore } from '../store/taskStore'
import { useGroupChatStore } from '../store/groupChatStore'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useResizable, resizeHandleStyle, onHandleHoverIn, onHandleHoverOut } from '../hooks/useResizable'
import { useTheme } from '../hooks/useTheme'
import OperatorDot from './OperatorDot'

// ── Rating dialog ─────────────────────────────────────────────────────────────

function RatingDialog({ prompt, send, onDismiss }) {
  const T = useTheme()
  const [score,   setScore]   = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function submit() {
    if (!score) return
    setSubmitting(true)
    send({ type: 'submit_rating', cid: prompt.cid,
           rated_uid: prompt.rated_uid, score, comment })
  }

  const display = hovered || score

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: T.surface, borderRadius: 14, padding: '28px 28px 22px',
        width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        border: `1px solid ${T.line}`,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 4 }}>
          Rate your experience
        </div>
        <div style={{ fontSize: 13, color: T.ink3, marginBottom: 20 }}>
          How was working with <b>{prompt.rated_name}</b>?
        </div>

        {/* Star picker */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, justifyContent: 'center' }}>
          {[1, 2, 3, 4, 5].map(n => (
            <span
              key={n}
              onClick={() => setScore(n)}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              style={{
                fontSize: 32, cursor: 'pointer', lineHeight: 1,
                color: n <= display ? '#f59e0b' : T.line,
                transition: 'color 0.1s',
                userSelect: 'none',
              }}
            >
              ★
            </span>
          ))}
        </div>

        {score > 0 && (
          <div style={{ textAlign: 'center', fontSize: 12, color: T.ink3, marginBottom: 14 }}>
            {['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][score]}
          </div>
        )}

        <textarea
          placeholder="Leave a comment (optional)"
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={3}
          style={{
            width: '100%', padding: '8px 10px', fontSize: 13,
            border: `1px solid ${T.inputBorder}`, borderRadius: 8,
            fontFamily: 'inherit', resize: 'none', outline: 'none',
            boxSizing: 'border-box', marginBottom: 16,
            background: T.inputBg, color: T.ink,
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onDismiss} style={{
            padding: '8px 16px', borderRadius: 7, border: `1px solid ${T.line}`,
            background: T.surface, fontSize: 13, cursor: 'pointer', color: T.ink3,
          }}>
            Skip
          </button>
          <button onClick={submit} disabled={!score || submitting} style={{
            padding: '8px 20px', borderRadius: 7, border: 'none',
            background: score ? '#0070f3' : T.surface2,
            color: score ? '#fff' : T.ink4,
            fontSize: 13, fontWeight: 600,
            cursor: score ? 'pointer' : 'default',
            transition: 'background 0.15s',
          }}>
            {submitting ? 'Sending…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Stars({ avg, count, size = 10 }) {
  if (!count || count < 1) return null
  const full = Math.round(avg)
  return (
    <span style={{ fontSize: size, whiteSpace: 'nowrap' }}>
      <span style={{ color: '#f59e0b' }}>{'★'.repeat(full)}</span>
      <span style={{ color: '#d1d5db' }}>{'★'.repeat(5 - full)}</span>
      <span style={{ color: '#9ca3af', marginLeft: 3, fontSize: size * 0.9 }}>
        {Number(avg).toFixed(1)} ({count})
      </span>
    </span>
  )
}

const CARD_STATUS = {
  matching:      { label: 'Matching…',      bg: '#fef9c3', color: '#854d0e', dot: '#f59e0b' },
  matched:       { label: 'In Progress',    bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
  active:        { label: 'Active',         bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
  finished:      { label: 'Finished',       bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
  all_finished:  { label: 'All Done',       bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
  pending_offer: { label: 'Pending Offer',  bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
}

const PARTICIPANT_STATUS = {
  active:   { label: 'Working',  bg: '#dcfce7', color: '#166534' },
  finished: { label: 'Finished', bg: '#f3f4f6', color: '#6b7280' },
}

function StatusPill({ status, small = false }) {
  const s = CARD_STATUS[status] ?? CARD_STATUS.active
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: s.bg, color: s.color, borderRadius: 20,
      padding: small ? '1px 6px' : '2px 8px',
      fontSize: small ? 9 : 10, fontWeight: 600,
    }}>
      <span style={{ width: small ? 4 : 5, height: small ? 4 : 5,
                     borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

function ParticipantStatusPill({ status }) {
  const s = PARTICIPANT_STATUS[status] ?? PARTICIPANT_STATUS.active
  return (
    <span style={{
      display: 'inline-block', background: s.bg, color: s.color,
      borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.04em',
    }}>
      {s.label}
    </span>
  )
}

function ParticipantTypeBadge({ type }) {
  if (type !== 'agent') return null
  return (
    <span style={{
      background: '#f0f9ff', border: '1px solid #bae6fd',
      color: '#0369a1', borderRadius: 8,
      padding: '0 5px', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.04em', flexShrink: 0,
    }}>
      Agent
    </span>
  )
}

function Avatar({ name, size = 30, faded = false }) {
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: faded ? '#d1d5db' : `hsl(${hue},55%,60%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff',
      transition: 'background 0.3s',
    }}>
      {initials}
    </div>
  )
}

// ── Demand card: one row per matched supply user ──────────────────────────────

function ParticipantRow({ p }) {
  const T = useTheme()
  const isFinished  = p.status === 'finished'
  const skills      = (p.skills || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 3)

  return (
    <div style={{
      display: 'flex', gap: 9, alignItems: 'flex-start',
      padding: '8px 0', borderTop: `1px solid ${T.line}`,
      opacity: isFinished ? 0.65 : 1, transition: 'opacity 0.3s',
    }}>
      <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
        <Avatar name={p.name} size={30} faded={isFinished} />
        <OperatorDot size={11} participantType={p.participant_type}
          style={{ position: 'absolute', bottom: -1, right: -1, boxShadow: '0 0 0 2px ' + T.surface }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{
            fontWeight: 600, fontSize: 12, color: T.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textDecoration: isFinished ? 'line-through' : 'none',
          }}>
            {p.name}
          </span>
          <ParticipantTypeBadge type={p.participant_type} />
          <ParticipantStatusPill status={p.status || 'active'} />
        </div>
        {p.location && (
          <div style={{ fontSize: 10, color: T.ink4, marginTop: 1 }}>📍 {p.location}</div>
        )}
        {skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
            {skills.map(sk => (
              <span key={sk} style={{
                background: T.greenSoft, border: '1px solid #bbf7d0',
                borderRadius: 10, padding: '1px 6px', fontSize: 10, color: '#166534',
              }}>
                {sk}
              </span>
            ))}
          </div>
        )}
        {p.task && (
          <div style={{
            marginTop: 4, fontSize: 11, color: T.ink3,
            background: T.surface2, border: `1px solid ${T.line}`,
            borderRadius: 6, padding: '4px 7px', lineHeight: 1.4,
            textDecoration: isFinished ? 'line-through' : 'none',
          }}>
            <span style={{ fontWeight: 700, color: T.ink2 }}>Sub-task: </span>
            {p.task}
          </div>
        )}
        <Stars avg={p.rating_avg} count={p.rating_count} />
      </div>
    </div>
  )
}

// ── Supply card: shows who assigned the task ──────────────────────────────────

function AssignedBySection({ demandInfo }) {
  const T = useTheme()
  if (!demandInfo) return null
  const skills = (demandInfo.skills || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 2)
  return (
    <div style={{
      background: T.blueSoft, border: `1px solid ${T.line}`,
      borderRadius: 8, padding: '8px 10px', marginTop: 8,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                    textTransform: 'uppercase', color: '#818cf8', marginBottom: 6 }}>
        Assigned by
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <Avatar name={demandInfo.name} size={28} />
          <OperatorDot size={11} participantType={demandInfo.participant_type}
            style={{ position: 'absolute', bottom: -1, right: -1, boxShadow: '0 0 0 2px ' + T.blueSoft }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: T.ink }}>
              {demandInfo.name}
            </span>
            <ParticipantTypeBadge type={demandInfo.participant_type} />
          </div>
          {demandInfo.location && (
            <div style={{ fontSize: 10, color: T.ink4, marginTop: 1 }}>📍 {demandInfo.location}</div>
          )}
          {skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              {skills.map(sk => (
                <span key={sk} style={{
                  background: T.agentSoft, border: `1px solid ${T.agentLine}`,
                  borderRadius: 10, padding: '1px 6px', fontSize: 10, color: '#4338ca',
                }}>
                  {sk}
                </span>
              ))}
            </div>
          )}
          <Stars avg={demandInfo.rating_avg} count={demandInfo.rating_count} />
        </div>
      </div>
    </div>
  )
}

// ── Supply card: co-workers ───────────────────────────────────────────────────

function PeersSection({ peers }) {
  const T = useTheme()
  if (!peers || peers.length === 0) return null
  return (
    <div style={{
      background: T.amberSoft, border: `1px solid ${T.line}`,
      borderRadius: 8, padding: '8px 10px', marginTop: 8,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                    textTransform: 'uppercase', color: '#b45309', marginBottom: 6 }}>
        Also working on this · {peers.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {peers.map(p => {
          const isFinished = p.status === 'finished'
          const skills = (p.skills || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 2)
          return (
            <div key={p.uid} style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                                      opacity: isFinished ? 0.6 : 1 }}>
              <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                <Avatar name={p.name} size={26} faded={isFinished} />
                <OperatorDot size={10} participantType={p.participant_type}
                  style={{ position: 'absolute', bottom: -1, right: -1, boxShadow: '0 0 0 2px ' + T.amberSoft }} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontWeight: 600, fontSize: 12, color: T.ink,
                                 textDecoration: isFinished ? 'line-through' : 'none' }}>
                    {p.name}
                  </span>
                  <ParticipantTypeBadge type={p.participant_type} />
                  <ParticipantStatusPill status={p.status || 'active'} />
                </div>
                {p.location && (
                  <div style={{ fontSize: 10, color: T.ink4, marginTop: 1 }}>📍 {p.location}</div>
                )}
                {skills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                    {skills.map(sk => (
                      <span key={sk} style={{ background: T.amberSoft, border: `1px solid ${T.line}`,
                                              borderRadius: 10, padding: '1px 6px',
                                              fontSize: 10, color: '#92400e' }}>
                        {sk}
                      </span>
                    ))}
                  </div>
                )}
                {p.task && (
                  <div style={{
                    marginTop: 4, fontSize: 11, color: T.ink3,
                    background: T.amberSoft, border: `1px solid ${T.line}`,
                    borderRadius: 6, padding: '4px 7px', lineHeight: 1.4,
                    textDecoration: isFinished ? 'line-through' : 'none',
                  }}>
                    <span style={{ fontWeight: 700, color: '#92400e' }}>Sub-task: </span>
                    {p.task}
                  </div>
                )}
                <Stars avg={p.rating_avg} count={p.rating_count} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onRemove, send }) {
  const T = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const isDemand    = task.role === 'demand'
  const isPending   = task.status === 'pending_offer'
  const participants = task.participants || []
  const openRoom    = useGroupChatStore(s => s.openRoom)
  const activeRoom  = useGroupChatStore(s => s.activeRoom)
  const rooms       = useGroupChatStore(s => s.rooms)
  const unread      = rooms[task.card_id]?.unread || 0
  const isRoomOpen  = activeRoom === task.card_id
  const activeCid    = useChatStore(s => s.activeCid)
  const setActiveCid = useChatStore(s => s.setActiveCid)
  const isActiveChat = activeCid === task.card_id

  // Compute effective status
  const allFinished = isDemand && participants.length > 0
                   && participants.every(p => p.status === 'finished')
  const isFinished  = !isDemand && task.status === 'finished'
  const effectiveStatus = allFinished ? 'all_finished' : task.status

  const accentColor  = isPending ? '#f97316' : isDemand ? '#0070f3' : '#22c55e'
  const accentLight  = isPending ? '#fff7ed' : isDemand ? T.blueSoft : T.greenSoft

  function handleAcceptOffer(yes) {
    send({ type: 'accept_pending_offer', cid: task.card_id, yes })
    if (!yes) onRemove(task.card_id)
  }

  function handleFinish() {
    send({ type: 'finish_task', cid: task.card_id, demand_uid: task.demand_uid ?? null })
  }

  function openGroupChat() {
    openRoom(task.card_id)
  }

  return (
    <div style={{
      background: T.surface,
      border: `${isActiveChat ? 2 : 1}px solid ${isActiveChat ? accentColor : T.line}`,
      borderRadius: 10, overflow: 'hidden', marginBottom: 10,
      opacity: (isFinished || allFinished) ? 0.78 : 1,
      transition: 'opacity 0.3s, border-color 0.15s',
      boxShadow: isActiveChat ? `0 0 0 2px ${accentColor}22` : 'none',
    }}>
      {/* Header */}
      <div
        onClick={() => setActiveCid(task.card_id)}
        style={{
          background: accentLight, padding: '9px 12px',
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        }}>
        <span style={{ fontSize: 12 }}>{isDemand ? '🔵' : isPending ? '🟠' : '🟢'}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: accentColor,
          letterSpacing: '0.05em', textTransform: 'uppercase', flex: 1,
        }}>
          {isDemand ? 'Requesting' : isPending ? 'Offer received' : 'Working on'}
          {isActiveChat && (
            <span style={{
              marginLeft: 6, fontSize: 9, padding: '1px 6px',
              background: accentColor, color: '#fff', borderRadius: 8,
              letterSpacing: '0.04em',
            }}>
              ● Viewing
            </span>
          )}
        </span>
        <StatusPill status={effectiveStatus} />
        {/* Group chat button */}
        <button onClick={(e) => { e.stopPropagation(); openGroupChat() }} style={{
          background: accentColor,
          border: `1px solid ${accentColor}`,
          borderRadius: 14, cursor: 'pointer',
          fontSize: 11, fontWeight: 700,
          color: '#fff',
          padding: '3px 10px',
          display: 'flex', alignItems: 'center', gap: 5,
          position: 'relative',
          boxShadow: isRoomOpen
            ? `inset 0 0 0 2px #fff, 0 0 0 2px ${accentColor}`
            : `0 1px 3px ${accentColor}55`,
          transition: 'box-shadow 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <span style={{ fontSize: 12 }}>💬</span>
          <span style={{ letterSpacing: '0.03em' }}>Chat</span>
          {unread > 0 && (
            <span
              title={`${unread} new message${unread > 1 ? 's' : ''}`}
              style={{
                position: 'absolute', top: -3, right: -3,
                width: 10, height: 10, borderRadius: '50%',
                background: '#ef4444',
                border: `2px solid ${T.surface}`,
                boxShadow: '0 0 0 1px #ef444488',
              }}
            />
          )}
        </button>
        <button onClick={(e) => { e.stopPropagation(); setCollapsed(c => !c) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                         fontSize: 11, color: T.ink4, padding: '0 2px' }}>
          {collapsed ? '▼' : '▲'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(task.card_id) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                         fontSize: 13, color: T.ink4, padding: '0 2px' }}>
          ✕
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '10px 12px' }}>
          {/* Summary title — overall intent (same on both sides) */}
          <div style={{
            fontSize: 13, fontWeight: 600, lineHeight: 1.45,
            textDecoration: (isFinished || allFinished) ? 'line-through' : 'none',
            color: (isFinished || allFinished) ? T.ink4 : T.ink,
          }}>
            {task.intent || (isDemand ? 'Active request' : (task.task || 'Assigned task'))}
          </div>

          {/* Supply side: show this user's specific sub-task */}
          {!isDemand && task.task && (
            <div style={{
              marginTop: 6, fontSize: 11, color: T.ink3,
              background: T.greenSoft, border: `1px solid ${T.line}`,
              borderRadius: 7, padding: '6px 9px', lineHeight: 1.45,
              textDecoration: isFinished ? 'line-through' : 'none',
            }}>
              <span style={{ fontWeight: 700, color: '#166534' }}>Your sub-task: </span>
              {task.task}
            </div>
          )}

          {/* Demand side: matched participant list */}
          {isDemand && participants.length > 0 && (
            <div>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                textTransform: 'uppercase', color: T.ink4, margin: '8px 0 0',
              }}>
                {participants.length} matched · {participants.filter(p => p.status === 'finished').length} finished
              </div>
              {participants.map(p => <ParticipantRow key={p.uid} p={p} />)}
            </div>
          )}

          {isDemand && participants.length === 0 && task.status === 'matching' && (
            <div style={{ fontSize: 11, color: T.ink4, marginTop: 4, fontStyle: 'italic' }}>
              Finding matches…
            </div>
          )}

          {/* GitHub ref badge (supply side) */}
          {!isDemand && task.github_ref && (
            <a
              href={task.github_ref.url}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                marginTop: 8, padding: '4px 9px',
                background: '#24292f', borderRadius: 6,
                textDecoration: 'none', fontSize: 11, color: '#94a3b8',
                border: '1px solid #30363d',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="#94a3b8">
                <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
              </svg>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                {task.github_ref.type === 'pr' ? 'PR' : '#'}{task.github_ref.number}
              </span>
              <span>{task.github_ref.owner}/{task.github_ref.repo}</span>
            </a>
          )}

          {/* Supply side: who assigned it + co-workers */}
          {!isDemand && (
            <>
              <AssignedBySection demandInfo={task.demand_info} />
              <PeersSection peers={task.peers ?? []} />
            </>
          )}

          {/* Pending offer: Accept / Decline */}
          {isPending && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={() => handleAcceptOffer(true)} style={{
                flex: 1, padding: '8px 0',
                background: '#22c55e', color: '#fff', border: 'none',
                borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                ✓ Accept
              </button>
              <button onClick={() => handleAcceptOffer(false)} style={{
                flex: 1, padding: '8px 0',
                background: T.surface2, color: T.ink3,
                border: `1px solid ${T.line}`,
                borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                ✕ Decline
              </button>
            </div>
          )}

          {/* Supply side: Finish button */}
          {!isDemand && !isPending && !isFinished && (
            <button onClick={handleFinish} style={{
              marginTop: 10, width: '100%', padding: '7px 0',
              background: '#22c55e', color: '#fff', border: 'none',
              borderRadius: 7, fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}>
              ✓ Mark as Finished
            </button>
          )}

          {!isDemand && !isPending && isFinished && (
            <div style={{ marginTop: 8, textAlign: 'center',
                          fontSize: 11, color: T.ink4, fontStyle: 'italic' }}>
              Task completed
            </div>
          )}

          {/* Timestamp */}
          <div style={{ fontSize: 10, color: T.ink4, marginTop: 8, textAlign: 'right' }}>
            {new Date(task.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all',     label: 'All',         match: () => true },
  { key: 'demand',  label: 'Requesting',  match: t => t.role === 'demand' },
  { key: 'supply',  label: 'Working on',  match: t => t.role === 'supply' && t.status !== 'pending_offer' },
  { key: 'pending', label: 'Pending',     match: t => t.status === 'pending_offer' },
]

export default function TaskSidebar({ send }) {
  const T          = useTheme()
  const tasks      = useTaskStore(s => s.tasks)
  const removeTask = useTaskStore(s => s.removeTask)
  const token        = useAuthStore(s => s.token)
  const activeCid    = useChatStore(s => s.activeCid)
  const setActiveCid = useChatStore(s => s.setActiveCid)
  const startNewChat = useChatStore(s => s.startNewChat)
  const pendingRatings    = useChatStore(s => s.pendingRatings)
  const dismissRatingPrompt = useChatStore(s => s.dismissRatingPrompt)
  const handleRemove = (card_id) => {
    if (activeCid === card_id) setActiveCid(null)
    removeTask(card_id, token)
  }
  const [activeTab, setActiveTab] = useState(() =>
    localStorage.getItem('task-sidebar-tab') || 'all'
  )
  const [folded, setFolded] = useState(() => localStorage.getItem('task-sidebar-folded') === 'true')

  function toggleFold() {
    const next = !folded
    setFolded(next)
    localStorage.setItem('task-sidebar-folded', next)
  }

  const { width, startResize } = useResizable({
    initial: 260, min: 200, max: 520,
    storageKey: 'task-sidebar-width', from: 'left',
  })

  function selectTab(key) {
    setActiveTab(key)
    localStorage.setItem('task-sidebar-tab', key)
  }

  const rooms    = useGroupChatStore(s => s.rooms)
  const counts   = Object.fromEntries(TABS.map(t => [t.key, tasks.filter(t.match).length]))
  const hasUnread = Object.fromEntries(TABS.map(t => [
    t.key,
    tasks.filter(t.match).some(tk => (rooms[tk.card_id]?.unread || 0) > 0),
  ]))
  const filtered = tasks.filter(TABS.find(t => t.key === activeTab).match)
  const anyUnread = tasks.some(tk => (rooms[tk.card_id]?.unread || 0) > 0)

  if (folded) return (
    <div style={{
      width: 28, flexShrink: 0,
      borderLeft: `1px solid ${T.line}`,
      background: T.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 10, gap: 6,
    }}>
      <button
        onClick={toggleFold}
        title="Expand task sidebar"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 16, color: T.ink3, padding: 4, lineHeight: 1,
          position: 'relative', borderRadius: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = T.ink}
        onMouseLeave={e => e.currentTarget.style.color = T.ink3}
      >
        ‹
        {(tasks.length > 0 || anyUnread) && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 7, height: 7, borderRadius: '50%',
            background: anyUnread ? '#ef4444' : '#0070f3',
            border: `1.5px solid ${T.bg}`,
          }} />
        )}
      </button>
      <div style={{
        fontSize: 9, color: T.ink4, fontWeight: 700,
        letterSpacing: '0.06em', writingMode: 'vertical-rl',
        textTransform: 'uppercase', userSelect: 'none',
      }}>
        Tasks
      </div>
    </div>
  )

  return (
    <div style={{
      width, flexShrink: 0, borderLeft: `1px solid ${T.line}`,
      background: T.bg, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      <div onMouseDown={startResize} style={resizeHandleStyle('left')}
           onMouseEnter={onHandleHoverIn} onMouseLeave={onHandleHoverOut} />
      <div style={{
        padding: '12px 14px 0', borderBottom: `1px solid ${T.line}`,
        background: T.surface, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                      marginBottom: 10 }}>
          <button
            onClick={toggleFold}
            title="Collapse task sidebar"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 15, color: T.ink4, padding: '0 3px', flexShrink: 0,
              lineHeight: 1, borderRadius: 4, transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = T.ink}
            onMouseLeave={e => e.currentTarget.style.color = T.ink4}
          >›</button>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.ink,
                        display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            My Tasks
            {tasks.length > 0 && (
              <span style={{
                background: '#0070f3', color: '#fff', borderRadius: 10,
                fontSize: 10, fontWeight: 700, padding: '1px 6px',
              }}>
                {tasks.length}
              </span>
            )}
          </div>
          <button
            onClick={() => startNewChat(token)}
            title="Start a fresh, blank chat"
            style={{
              background: activeCid === null ? '#0070f3' : T.surface,
              color: activeCid === null ? '#fff' : '#0070f3',
              border: '1px solid #0070f3',
              borderRadius: 14, cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4,
              transition: 'background 0.15s, color 0.15s',
            }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>＋</span>
            New chat
          </button>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(t => {
            const active    = activeTab === t.key
            const isPendingTab = t.key === 'pending'
            const tabColor  = isPendingTab ? '#f97316' : '#0070f3'
            const hasPending = isPendingTab && counts[t.key] > 0
            return (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                style={{
                  position: 'relative',
                  flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '6px 4px', fontSize: 11, fontWeight: 600,
                  color: active ? tabColor : hasPending ? '#f97316' : T.ink3,
                  borderBottom: `2px solid ${active ? tabColor : 'transparent'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 4, transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {t.label}
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  background: active ? tabColor : hasPending ? '#fff7ed' : T.surface2,
                  color: active ? '#fff' : hasPending ? '#c2410c' : T.ink3,
                  borderRadius: 8, padding: '0 5px', minWidth: 14, textAlign: 'center',
                }}>
                  {counts[t.key]}
                </span>
                {hasUnread[t.key] && (
                  <span
                    title="New messages"
                    style={{
                      position: 'absolute', top: 2, right: 4,
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#ef4444',
                      border: `1.5px solid ${T.surface}`,
                      boxShadow: '0 0 0 1px #ef444488',
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {pendingRatings.length > 0 && (
        <RatingDialog
          prompt={pendingRatings[0]}
          send={send}
          onDismiss={() => dismissRatingPrompt(pendingRatings[0].cid, pendingRatings[0].rated_uid)}
        />
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 0' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: T.ink4, fontSize: 12,
                        marginTop: 40, lineHeight: 1.6 }}>
            {tasks.length === 0 ? (
              <>
                No active tasks
                <br />
                <span style={{ fontSize: 11 }}>
                  Tasks appear here when<br />you send or accept a request.
                </span>
              </>
            ) : (
              <>Nothing in <b>{TABS.find(t => t.key === activeTab).label}</b></>
            )}
          </div>
        ) : (
          filtered.map(t => (
            <TaskCard key={t.card_id} task={t} onRemove={handleRemove} send={send} />
          ))
        )}
      </div>
    </div>
  )
}
