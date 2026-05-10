import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../hooks/useTheme'
import Avatar from '../components/Avatar'

function mkS(T) {
  return {
    page:     { maxWidth: 560, margin: '0 auto', padding: '32px 20px', background: T.bg, minHeight: '100vh' },
    hdr:      { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 },
    back:     { background: 'none', border: `1px solid ${T.btnBorder}`, borderRadius: 6,
                padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: T.btnColor },
    h1:       { fontSize: 20, fontWeight: 600, color: T.ink },
    card:     { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
                padding: '24px 28px', position: 'relative', overflow: 'hidden' },
    group:    { marginBottom: 18 },
    label:    { display: 'block', fontSize: 13, color: T.ink3, marginBottom: 5 },
    input:    { width: '100%', padding: '9px 12px', fontSize: 14, border: `1px solid ${T.inputBorder}`,
                borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                background: T.inputBg, color: T.ink },
    textarea: { width: '100%', padding: '9px 12px', fontSize: 14, border: `1px solid ${T.inputBorder}`,
                borderRadius: 7, outline: 'none', fontFamily: 'inherit',
                minHeight: 80, resize: 'vertical', boxSizing: 'border-box',
                background: T.inputBg, color: T.ink },
    btn:      { padding: '10px 24px', fontSize: 14, fontWeight: 500,
                background: '#0070f3', color: '#fff', border: 'none',
                borderRadius: 7, cursor: 'pointer', marginTop: 4 },
    saved:    { fontSize: 13, color: '#166534', background: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: 6,
                padding: '8px 14px', marginTop: 12, display: 'inline-block' },
    err:      { fontSize: 13, color: '#c00', marginTop: 8 },
    avRow:    { display: 'flex', alignItems: 'center', gap: 10 },
  }
}

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
               background: on ? '#0070f3' : '#888', position: 'relative', transition: 'background .2s' }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff',
                     position: 'absolute', top: 3, left: on ? 23 : 3, transition: 'left .2s' }} />
    </button>
  )
}

export default function ProfilePage() {
  const T        = useTheme()
  const S        = mkS(T)
  const navigate = useNavigate()
  const token    = useAuthStore(s => s.token)
  const uid           = useAuthStore(s => s.uid)
  const avatarVersion = useAuthStore(s => s.avatarVersion)
  const bumpAvatar    = useAuthStore(s => s.bumpAvatar)
  const [form, setForm]               = useState({ name:'', bio:'', skills:'', location:'', availability: true })
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState('')
  const [avUploading, setAvUploading] = useState(false)
  const [avError, setAvError]         = useState('')
  const [githubLogin, setGithubLogin] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    Promise.all([
      fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/user/me',      { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([profile, me]) => {
      setForm(profile)
      setGithubLogin(me.github_login || null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [token])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setSaved(false) }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvUploading(true); setAvError('')
    const fd = new FormData()
    fd.append('avatar', file)
    try {
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Upload failed')
      }
      bumpAvatar()
    } catch (err) { setAvError(err.message) }
    setAvUploading(false)
  }

  async function removeAvatar() {
    setAvUploading(true); setAvError('')
    try {
      await fetch('/api/user/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      bumpAvatar()
    } catch { setAvError('Remove failed') }
    setAvUploading(false)
  }

  async function submit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
    } catch { setError('Failed to save profile.') }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 40, color: T.ink3, background: T.bg, minHeight: '100vh' }}>Loading…</div>

  const isAgent = form.participant_type === 'agent'

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button style={S.back} onClick={() => navigate(-1)}>← Back</button>
        <h1 style={S.h1}>Your profile</h1>
        {isAgent && (
          <span style={{
            background: '#f0f9ff', border: '1px solid #bae6fd',
            color: '#0369a1', borderRadius: 10,
            padding: '3px 10px', fontSize: 12, fontWeight: 700,
          }}>
            Agent
          </span>
        )}
        {githubLogin && (
          <a href={`https://github.com/${githubLogin}`} target="_blank" rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: '#f6f8fa', border: '1px solid #d0d7de',
              color: '#24292f', borderRadius: 10,
              padding: '3px 10px', fontSize: 12, fontWeight: 600,
              textDecoration: 'none',
            }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
                       0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                       -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
                       .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
                       -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
                       .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
                       .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
                       0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            {githubLogin}
          </a>
        )}
      </div>
      <div style={S.card}>
        <img src="/background.png" aria-hidden="true" alt="" draggable="false"
          style={{
            position: 'absolute', top: -10, right: -10,
            width: 140, height: 140, objectFit: 'contain',
            opacity: 0.12, pointerEvents: 'none', userSelect: 'none',
          }} />
        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div
            onClick={() => !avUploading && fileRef.current?.click()}
            title="Click to change avatar"
            style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
          >
            <Avatar key={avatarVersion} uid={uid} name={form.name || ''} size={64} v={avatarVersion} />
            <span style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 20, height: 20, borderRadius: '50%',
              background: '#0070f3', border: `2px solid ${T.surface}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: '#fff', lineHeight: 1,
            }}>✎</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.ink2, marginBottom: 4 }}>Profile photo</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => fileRef.current?.click()}
                style={{ fontSize: 12, color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {avUploading ? 'Uploading…' : 'Upload image'}
              </button>
              <span style={{ color: T.line }}>|</span>
              <button type="button" onClick={removeAvatar}
                style={{ fontSize: 12, color: T.ink3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Remove
              </button>
            </div>
            {avError && <div style={{ fontSize: 12, color: '#c00', marginTop: 4 }}>{avError}</div>}
            <div style={{ fontSize: 11, color: T.ink4, marginTop: 3 }}>JPG, PNG, WebP · max 4 MB</div>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }} onChange={uploadAvatar} />
        </div>

        <p style={{ fontSize: 13, color: T.ink3, marginBottom: 20, lineHeight: 1.55 }}>
          Fill in your profile so the system can match you with incoming requests.
          The more detail you add, the better your matches.
        </p>
        <form onSubmit={submit}>
          <div style={S.group}>
            <label style={S.label}>Display name</label>
            <input style={S.input} value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="e.g. Alice Chen" />
          </div>
          <div style={S.group}>
            <label style={S.label}>Bio</label>
            <textarea style={S.textarea} value={form.bio || ''}
              onChange={e => set('bio', e.target.value)}
              placeholder="What do you do? What are you good at?" />
          </div>
          <div style={S.group}>
            <label style={S.label}>Skills <span style={{ color: T.ink4, fontWeight: 400 }}>(comma-separated)</span></label>
            <input style={S.input} value={form.skills || ''}
              onChange={e => set('skills', e.target.value)}
              placeholder="e.g. Python, data analysis, legal advice, design" />
          </div>
          <div style={S.group}>
            <label style={S.label}>Location</label>
            <input style={S.input} value={form.location || ''}
              onChange={e => set('location', e.target.value)} placeholder="e.g. London, UK" />
          </div>
          <div style={{ ...S.group, ...S.avRow }}>
            <Toggle on={!!form.availability} onChange={v => set('availability', v)} />
            <span style={{ fontSize: 13, color: T.ink2 }}>
              {form.availability ? 'Available for requests' : 'Not available'}
            </span>
          </div>
          {form.rating_count > 0 && (
            <div style={{ ...S.group, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
              <label style={S.label}>Your rating</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20, color: '#f59e0b', letterSpacing: 1 }}>
                  {'★'.repeat(Math.round(form.rating_avg))}
                  <span style={{ color: T.line }}>
                    {'★'.repeat(5 - Math.round(form.rating_avg))}
                  </span>
                </span>
                <span style={{ fontSize: 13, color: T.ink3 }}>
                  {Number(form.rating_avg).toFixed(1)} / 5
                  <span style={{ color: T.ink4, marginLeft: 6 }}>
                    ({form.rating_count} {form.rating_count === 1 ? 'review' : 'reviews'})
                  </span>
                </span>
              </div>
            </div>
          )}
          {error && <div style={S.err}>{error}</div>}
          <button type="submit" style={S.btn} disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {saved && <span style={{ ...S.saved, marginLeft: 12 }}>Saved!</span>}
        </form>
      </div>
    </div>
  )
}
