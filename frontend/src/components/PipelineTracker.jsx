import React from 'react'
import { useChatStore } from '../store/chatStore'
import { useTheme } from '../hooks/useTheme'

const ICON = {
  running: (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ animation: 'spin 1s linear infinite', display: 'block' }}>
      <circle cx="9" cy="9" r="7" fill="none" stroke="#c0b3e8" strokeWidth="2.5" />
      <path d="M9 2 A7 7 0 0 1 16 9" fill="none" stroke="#7c5cbf" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  done: (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: 'block' }}>
      <circle cx="9" cy="9" r="8" fill="#22c55e" />
      <polyline points="5,9 8,12 13,6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  failed: (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: 'block' }}>
      <circle cx="9" cy="9" r="8" fill="#ef4444" />
      <line x1="6" y1="6" x2="12" y2="12" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="6" x2="6" y2="12" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
}

const keyframes = `@keyframes spin { to { transform: rotate(360deg); } }`

// accent colors that don't vary by theme
const AGENT = '#7c5cbf'
const GREEN = '#22c55e'
const RED   = '#ef4444'

function mkColor(T) {
  return {
    done:    { label: '#166534', bg: T.greenSoft, border: T.line },
    failed:  { label: '#991b1b', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' },
    running: { label: AGENT,     bg: T.agentSoft, border: T.agentLine },
  }
}

function Section({ title, children }) {
  const T = useTheme()
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: T.ink4, marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function TextBlock({ text }) {
  const T = useTheme()
  return (
    <div style={{ background: T.surface2, borderRadius: 6, padding: '7px 10px',
                  fontSize: 12, color: T.ink2, whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word', lineHeight: 1.55, maxHeight: 200,
                  overflowY: 'auto' }}>
      {text}
    </div>
  )
}

function ProfileCard({ profile, task }) {
  const T = useTheme()
  const initials = (profile.name || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const skills = (profile.skills || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean)
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, lineHeight: 1.2 }}>
            {profile.name || `User ${profile.uid}`}
          </div>
          {profile.location && (
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>
              📍 {profile.location}
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)',
                      borderRadius: 20, padding: '3px 10px',
                      fontSize: 11, color: '#fff', fontWeight: 600 }}>
          ✓ Accepted
        </div>
      </div>
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {profile.bio && (
          <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>{profile.bio}</div>
        )}
        {skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {skills.map(s => (
              <span key={s} style={{ background: T.greenSoft, border: `1px solid ${T.line}`,
                                     borderRadius: 12, padding: '2px 9px',
                                     fontSize: 11, color: '#166534', fontWeight: 500 }}>
                {s}
              </span>
            ))}
          </div>
        )}
        {task && (
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 8, marginTop: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                          textTransform: 'uppercase', color: T.ink4, marginBottom: 4 }}>
              Task assigned
            </div>
            <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5,
                          background: T.surface2, borderRadius: 6, padding: '6px 9px' }}>
              {task}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CandidateList({ candidates }) {
  const T = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {candidates.map(c => (
        <div key={c.uid} style={{ background: T.surface2, borderRadius: 6, padding: '7px 10px', fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: T.ink, marginBottom: 2 }}>
            {c.name || `User ${c.uid}`}
            <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11,
                           color: c.available ? '#16a34a' : '#dc2626' }}>
              {c.available ? '● available' : '○ unavailable'}
            </span>
          </div>
          {c.skills   && <div style={{ color: T.ink3 }}>Skills: {c.skills}</div>}
          {c.bio      && <div style={{ color: T.ink3, marginTop: 2 }}>{c.bio}</div>}
          {c.location && <div style={{ color: T.ink4, marginTop: 1 }}>📍 {c.location}</div>}
        </div>
      ))}
    </div>
  )
}

function StepDetail({ extra }) {
  const T = useTheme()
  if (!extra || !Object.keys(extra).length) return null
  const { intent, data_excerpt, thinking, candidates, task, summary, profile, accepted } = extra
  return (
    <div style={{ borderTop: `1px solid ${T.agentLine}`, marginTop: 8, paddingTop: 10,
                  display: 'flex', flexDirection: 'column', gap: 8 }}>
      {profile && accepted && <ProfileCard profile={profile} task={task} />}
      {intent && (
        <Section title="Detected intent">
          <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.5,
                        background: T.agentSoft, borderRadius: 6, padding: '7px 10px' }}>
            {intent}
          </div>
        </Section>
      )}
      {data_excerpt && <Section title="Data excerpt for consent"><TextBlock text={data_excerpt} /></Section>}
      {candidates?.length > 0 && (
        <Section title={`${candidates.length} candidate${candidates.length !== 1 ? 's' : ''}`}>
          <CandidateList candidates={candidates} />
        </Section>
      )}
      {task && !(profile && accepted) && <Section title="Task sent"><TextBlock text={task} /></Section>}
      {typeof accepted === 'boolean' && !profile && (
        <Section title="Response">
          <div style={{ fontSize: 12, fontWeight: 600, color: accepted ? '#16a34a' : '#dc2626' }}>
            {accepted ? '✓ Accepted' : '✗ Declined'}
          </div>
        </Section>
      )}
      {summary  && <Section title="Summary"><TextBlock text={summary} /></Section>}
      {thinking && <Section title="LLM thinking"><TextBlock text={thinking} /></Section>}
    </div>
  )
}

function hasDetail(extra) {
  if (!extra) return false
  return Object.values(extra).some(v => v !== null && v !== undefined &&
    (typeof v !== 'string' || v.length > 0) &&
    (typeof v !== 'object' || (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0))
  )
}

export default function PipelineTracker() {
  const T          = useTheme()
  const COLOR      = mkColor(T)
  const allPipeline = useChatStore(s => s.pipeline)
  const activeCid   = useChatStore(s => s.activeCid)
  const toggleStep  = useChatStore(s => s.togglePipelineStep)

  const pipeline = allPipeline.filter(p =>
    activeCid ? p.cid === activeCid : !p.cid
  )

  if (!pipeline.length) return null

  return (
    <>
      <style>{keyframes}</style>
      <div style={{ margin: '4px 0 8px', background: 'transparent',
                    border: `1px solid ${T.line}`, borderRadius: 12,
                    padding: '12px 14px', fontSize: 13 }}>
        <div style={{ fontWeight: 700, color: T.ink3, fontSize: 11,
                      letterSpacing: '0.07em', textTransform: 'uppercase',
                      marginBottom: 10 }}>
          Processing pipeline
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {pipeline.map((step, i) => {
            const last      = i === pipeline.length - 1
            const c         = COLOR[step.status] ?? COLOR.running
            const clickable = hasDetail(step.extra)
            return (
              <div key={step.id}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
                              paddingBottom: last && !step.expanded ? 0 : 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column',
                                alignItems: 'center', flexShrink: 0, width: 18 }}>
                    {ICON[step.status] ?? ICON.running}
                    {!last && (
                      <div style={{ width: 2, flex: 1, minHeight: 12, marginTop: 3,
                                    background: step.status === 'done'   ? GREEN
                                              : step.status === 'failed' ? RED
                                              : T.agentLine,
                                    borderRadius: 1 }} />
                    )}
                  </div>
                  <div style={{ flex: 1, paddingTop: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center',
                                  justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 500, color: T.ink, lineHeight: 1.3, flex: 1 }}>
                        {step.label}
                      </div>
                      {clickable && (
                        <button onClick={() => toggleStep(step.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                                   padding: '1px 4px', borderRadius: 4, fontSize: 11,
                                   color: T.ink3, fontWeight: 500, flexShrink: 0, lineHeight: 1 }}>
                          {step.expanded ? '▲ less' : '▼ details'}
                        </button>
                      )}
                    </div>
                    {step.detail && (
                      <div style={{ color: T.ink3, fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                        {step.detail}
                      </div>
                    )}
                    {step.expanded && clickable && (
                      <div style={{ marginTop: 8, background: c.bg, border: `1px solid ${c.border}`,
                                    borderRadius: 8, padding: '10px 12px' }}>
                        <StepDetail extra={step.extra} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
