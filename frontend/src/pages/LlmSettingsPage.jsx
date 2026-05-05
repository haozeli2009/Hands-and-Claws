import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../hooks/useTheme'

function mkS(T) {
  return {
    page:     { maxWidth: 560, margin: '0 auto', padding: '32px 20px', background: T.bg, minHeight: '100vh' },
    hdr:      { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
    back:     { background: 'none', border: `1px solid ${T.btnBorder}`, borderRadius: 6,
                padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: T.btnColor },
    h1:       { fontSize: 20, fontWeight: 600, color: T.ink },
    sub:      { fontSize: 13, color: T.ink3, lineHeight: 1.55, marginBottom: 20 },
    card:     { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
                padding: '24px 28px', position: 'relative', overflow: 'hidden' },
    group:    { marginBottom: 16 },
    row:      { display: 'flex', gap: 8, alignItems: 'center' },
    label:    { display: 'block', fontSize: 13, color: T.ink3, marginBottom: 5 },
    input:    { width: '100%', padding: '9px 12px', fontSize: 14, border: `1px solid ${T.inputBorder}`,
                borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                background: T.inputBg, color: T.ink },
    select:   { width: '100%', padding: '9px 12px', fontSize: 14, border: `1px solid ${T.inputBorder}`,
                borderRadius: 7, outline: 'none', fontFamily: 'inherit',
                background: T.inputBg, color: T.ink, boxSizing: 'border-box' },
    btn:      { padding: '9px 20px', fontSize: 14, fontWeight: 500,
                background: '#0070f3', color: '#fff', border: 'none',
                borderRadius: 7, cursor: 'pointer' },
    btnGhost: { padding: '9px 16px', fontSize: 13, fontWeight: 500,
                background: T.surface2, color: T.ink3, border: `1px solid ${T.btnBorder}`,
                borderRadius: 7, cursor: 'pointer' },
    saved:    { fontSize: 13, color: '#166534', background: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: 6,
                padding: '8px 14px', marginTop: 12, display: 'inline-block' },
    err:      { fontSize: 13, color: '#c00', marginTop: 8 },
    note:     { fontSize: 12, color: T.ink4, marginTop: 6, lineHeight: 1.5 },
    hint:     { fontSize: 12, color: T.ink3, marginTop: 6,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
    warn:     { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                padding: '12px 14px', fontSize: 13, color: '#713f12', lineHeight: 1.55,
                marginBottom: 18 },
    disabled: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '12px 14px', fontSize: 13, color: '#7f1d1d', lineHeight: 1.55,
                marginBottom: 18 },
  }
}

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o',
}

export default function LlmSettingsPage() {
  const T        = useTheme()
  const S        = mkS(T)
  const navigate = useNavigate()
  const token    = useAuthStore(s => s.token)

  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState(DEFAULT_MODELS.anthropic)
  const [apiKey, setApiKey] = useState('')
  const [keyHint, setKeyHint] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/user/llm', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        setEnabled(!!d.enabled)
        setConfigured(!!d.configured)
        if (d.provider) setProvider(d.provider)
        if (d.model)    setModel(d.model)
        setKeyHint(d.api_key_hint || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token])

  function onProvider(p) {
    setProvider(p)
    if (!configured) setModel(DEFAULT_MODELS[p] || '')
    setSaved(false)
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    if (!apiKey) { setError('Paste an API key to save.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/user/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider, model, api_key: apiKey }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Save failed')
      }
      const d = await res.json()
      setConfigured(true)
      setKeyHint(d.api_key_hint || '')
      setApiKey('')
      setSaved(true)
    } catch (err) { setError(err.message || 'Failed to save.') }
    setSaving(false)
  }

  async function clear() {
    if (!confirm('Clear your saved LLM key? Your Delegate will fall back to the system default.')) return
    setError('')
    try {
      const res = await fetch('/api/user/llm', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Clear failed')
      setConfigured(false)
      setKeyHint('')
      setApiKey('')
      setSaved(false)
    } catch (err) { setError(err.message || 'Failed to clear.') }
  }

  if (loading) return <div style={{ padding: 40, color: T.ink3, background: T.bg, minHeight: '100vh' }}>Loading…</div>

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button style={S.back} onClick={() => navigate(-1)}>← Back</button>
        <h1 style={S.h1}>LLM settings</h1>
      </div>

      <p style={S.sub}>
        Your Delegate (Cloud User Agent) can use your own LLM API credentials instead
        of the system default. This affects only <strong>your</strong> Delegate — the
        Central Agent that matches tasks across users always uses the server's
        model.
      </p>

      {!enabled && (
        <div style={S.disabled}>
          Per-user LLM keys are disabled on this server.
          An admin needs to set <code>LLM_KEY_ENCRYPTION_KEY</code> in the
          backend <code>.env</code>.
        </div>
      )}

      {enabled && (
        <div style={S.warn}>
          Your key is encrypted at rest with a server-side symmetric key and
          decrypted only when your Delegate needs it. It is never logged or sent
          back to the browser — we only display a short hint so you can tell
          which key is saved.
        </div>
      )}

      <div style={S.card}>
        <img src="/background.png" aria-hidden="true" alt="" draggable="false"
          style={{ position: 'absolute', top: -10, right: -10, width: 140, height: 140,
            objectFit: 'contain', opacity: 0.12, pointerEvents: 'none', userSelect: 'none' }} />
        <form onSubmit={save}>
          <div style={S.group}>
            <label style={S.label}>Provider</label>
            <select style={S.select} value={provider}
                    onChange={e => onProvider(e.target.value)}
                    disabled={!enabled}>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
            </select>
          </div>

          <div style={S.group}>
            <label style={S.label}>Model</label>
            <input style={S.input} value={model}
                   onChange={e => { setModel(e.target.value); setSaved(false) }}
                   placeholder={DEFAULT_MODELS[provider]}
                   disabled={!enabled} />
            <div style={S.note}>
              Any model name supported by the provider's API
              (e.g. <code>{DEFAULT_MODELS[provider]}</code>).
            </div>
          </div>

          <div style={S.group}>
            <label style={S.label}>API key</label>
            <div style={S.row}>
              <input style={S.input}
                     type={showKey ? 'text' : 'password'}
                     value={apiKey}
                     onChange={e => { setApiKey(e.target.value); setSaved(false) }}
                     placeholder={configured ? 'Paste a new key to replace the saved one' : 'sk-…'}
                     disabled={!enabled}
                     autoComplete="off" />
              <button type="button" style={S.btnGhost}
                      onClick={() => setShowKey(s => !s)}>
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            {configured && keyHint && (
              <div style={S.hint}>Current key: {keyHint}</div>
            )}
          </div>

          {error && <div style={S.err}>{error}</div>}

          <div style={{ ...S.row, marginTop: 14 }}>
            <button type="submit" style={S.btn} disabled={saving || !enabled}>
              {saving ? 'Saving…' : (configured ? 'Replace key' : 'Save')}
            </button>
            {configured && (
              <button type="button" style={S.btnGhost} onClick={clear}>
                Clear saved key
              </button>
            )}
            {saved && <span style={S.saved}>Saved!</span>}
          </div>
        </form>
      </div>
    </div>
  )
}
