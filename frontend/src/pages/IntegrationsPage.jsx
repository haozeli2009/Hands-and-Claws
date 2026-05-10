import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../hooks/useTheme'

function mkS(T) {
  return {
    page:      { maxWidth: 720, margin: '0 auto', padding: '32px 20px', background: T.bg, minHeight: '100vh' },
    hdr:       { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
    back:      { background: 'none', border: `1px solid ${T.btnBorder}`, borderRadius: 6,
                 padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: T.btnColor },
    h1:        { fontSize: 20, fontWeight: 600, color: T.ink },
    sub:       { fontSize: 13, color: T.ink3, lineHeight: 1.55, marginBottom: 24 },
    card:      { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
                 padding: '20px 24px', marginBottom: 18, position: 'relative', overflow: 'hidden' },
    step:      { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 },
    num:       { width: 22, height: 22, borderRadius: '50%', background: '#0070f3', color: '#fff',
                 fontSize: 12, fontWeight: 600, display: 'inline-flex',
                 alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    stepTitle: { fontSize: 14, fontWeight: 600, color: T.ink },
    stepBody:  { fontSize: 13, color: T.ink3, marginLeft: 32, marginBottom: 10, lineHeight: 1.55 },
    codeWrap:  { position: 'relative', marginLeft: 32, marginBottom: 14 },
    code:      { display: 'block', background: '#0f172a', color: '#e2e8f0', borderRadius: 8,
                 padding: '12px 14px', fontSize: 12.5, lineHeight: 1.55,
                 fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                 whiteSpace: 'pre', overflowX: 'auto' },
    copyBtn:   { position: 'absolute', top: 8, right: 8, background: '#1e293b',
                 border: '1px solid #334155', color: '#cbd5e1', fontSize: 11,
                 padding: '3px 10px', borderRadius: 5, cursor: 'pointer' },
    warn:      { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                 padding: '12px 14px', fontSize: 13, color: '#713f12', lineHeight: 1.55,
                 marginBottom: 20 },
    tokenRow:  { marginLeft: 32, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 },
    tokenToggle: { background: 'none', border: `1px solid ${T.btnBorder}`, borderRadius: 5,
                   padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: T.btnColor },
    note:      { fontSize: 12, color: T.ink4, marginLeft: 32, marginTop: -4, marginBottom: 12 },
  }
}

function Code({ text, S }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard may be blocked over plain HTTP */ }
  }
  return (
    <div style={S.codeWrap}>
      <pre style={S.code}>{text}</pre>
      <button style={S.copyBtn} onClick={copy}>{copied ? 'copied' : 'copy'}</button>
    </div>
  )
}

export default function IntegrationsPage() {
  const T        = useTheme()
  const S        = mkS(T)
  const navigate   = useNavigate()
  const authToken  = useAuthStore(s => s.token)
  const [show, setShow]               = useState(false)
  const [pluginToken, setPluginToken] = useState(null)
  const [rotating, setRotating]       = useState(false)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'

  const fetchToken = useCallback(async () => {
    if (!authToken) return
    try {
      const res = await fetch('/api/user/openclaw-token', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setPluginToken(data.token)
      }
    } catch { /* network error — token stays null */ }
  }, [authToken])

  useEffect(() => { fetchToken() }, [fetchToken])

  async function rotateToken() {
    if (!authToken || rotating) return
    setRotating(true)
    try {
      const res = await fetch('/api/user/openclaw-token/rotate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setPluginToken(data.token)
        setShow(false)
      }
    } finally {
      setRotating(false)
    }
  }

  const maskedToken = pluginToken ? pluginToken.slice(0, 8) + '…' + pluginToken.slice(-6) : '...'

  const configJson = useMemo(() => JSON.stringify({
    'hands-and-claws': {
      accounts: {
        default: {
          baseUrl,
          token: pluginToken ?? '<loading…>',
        },
      },
    },
  }, null, 2), [baseUrl, pluginToken])

  const buildCmds = [
    'git clone https://github.com/haozeli2009/Hands-and-Claws.git',
    'cd Hands-and-Claws/openclaw-plugin',
    'npm install && npm run build',
  ].join('\n')

  const registerCmd = 'openclaw plugin add ~/Hands-and-Claws/openclaw-plugin'
  const restartCmd  = 'openclaw restart   # or: systemctl --user restart openclaw'

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <button style={S.back} onClick={() => navigate(-1)}>← Back</button>
        <h1 style={S.h1}>Connect OpenClaw</h1>
      </div>

      <p style={S.sub}>
        OpenClaw is a local-first personal assistant that runs on your own machine.
        This plugin registers <strong>Hands&amp;Claws as a channel</strong> inside your
        openclaw — just like Telegram or Slack is a channel. Events from your
        Hands&amp;Claws Delegate arrive as messages on that channel, and whatever openclaw
        replies flows back into Hands&amp;Claws as you.
      </p>

      <div style={S.warn}>
        <strong>Heads-up:</strong> this token grants openclaw access to act as you on Hands&amp;Claws.
        Anyone who has it can send messages and accept tasks on your behalf.
        Only paste it on a machine you trust. Use <strong>Rotate</strong> to invalidate it immediately if compromised.
      </div>

      <div style={S.card}>
        <img src="/background.png" aria-hidden="true" alt="" draggable="false"
          style={{ position: 'absolute', top: -10, right: -10, width: 140, height: 140,
            objectFit: 'contain', opacity: 0.12, pointerEvents: 'none', userSelect: 'none' }} />
        <div style={S.step}>
          <span style={S.num}>1</span>
          <span style={S.stepTitle}>Build the plugin</span>
        </div>
        <div style={S.stepBody}>
          From the Hands&amp;Claws host (or wherever you cloned this repo):
        </div>
        <Code text={buildCmds} S={S} />

        <div style={S.step}>
          <span style={S.num}>2</span>
          <span style={S.stepTitle}>Register it with openclaw</span>
        </div>
        <div style={S.stepBody}>
          Exact flag name may differ across openclaw versions — see
          {' '}<code>docs.openclaw.ai/plugins/building-plugins</code> if this complains.
        </div>
        <Code text={registerCmd} S={S} />

        <div style={S.step}>
          <span style={S.num}>3</span>
          <span style={S.stepTitle}>Add this to <code>~/.openclaw/openclaw.json</code></span>
        </div>
        <div style={S.stepBody}>
          Merge into the existing file — don't overwrite other channels you've configured.
        </div>
        <div style={S.tokenRow}>
          <span style={{ fontSize: 12, color: T.ink3 }}>Your token:</span>
          <code style={{ fontSize: 12, color: T.ink2 }}>
            {show ? pluginToken : maskedToken}
          </code>
          <button style={S.tokenToggle} onClick={() => setShow(s => !s)}>
            {show ? 'Hide' : 'Show'}
          </button>
          <button style={{ ...S.tokenToggle, color: '#b91c1c', borderColor: '#fca5a5' }}
                  onClick={rotateToken} disabled={rotating}>
            {rotating ? 'Rotating…' : 'Rotate'}
          </button>
        </div>
        <Code text={configJson} S={S} />
        <div style={S.note}>
          The snippet above is pre-filled with your current JWT and this host's URL.
        </div>

        <div style={S.step}>
          <span style={S.num}>4</span>
          <span style={S.stepTitle}>Restart openclaw</span>
        </div>
        <Code text={restartCmd} S={S} />
      </div>

      <div style={S.card}>
        <div style={{ ...S.stepTitle, marginBottom: 10 }}>How it behaves</div>
        <ul style={{ ...S.sub, marginLeft: 20, marginBottom: 12 }}>
          <li>Inbound: Hands&amp;Claws LUI events (consent prompts, status updates, group messages) arrive as incoming messages on the <code>hands-and-claws</code> channel inside openclaw.</li>
          <li>Outbound: anything openclaw sends on that channel becomes a <code>user_message</code> (or <code>consent_reply</code> for YES/NO replies) on Hands&amp;Claws, acting as you.</li>
          <li>Consent prompts render as plain text with a <code>YES</code> / <code>NO</code> instruction — reply <code>yes</code> or <code>no</code> to approve or decline.</li>
          <li>Your browser session keeps working — both surfaces receive the same events.</li>
        </ul>

        <div style={{ ...S.stepTitle, marginTop: 6, marginBottom: 6, fontSize: 13 }}>
          Proxy vs. delegate (your choice, openclaw-side)
        </div>
        <p style={{ ...S.sub, marginBottom: 6 }}>
          The plugin is just a pipe. Whether openclaw forwards Hands&amp;Claws events to
          you for manual handling, or responds autonomously on your behalf, is
          decided by how you configure the openclaw agent that owns the
          <code> hands-and-claws</code> channel:
        </p>
        <ul style={{ ...S.sub, marginLeft: 20, marginBottom: 0 }}>
          <li><strong>Proxy mode</strong> — openclaw relays Hands&amp;Claws events to whichever channel you're active on (Telegram/iMessage/etc.) and pipes your typed replies back. Human in the loop on every decision.</li>
          <li><strong>Delegate mode</strong> — openclaw's agent answers Hands&amp;Claws autonomously (auto-consents within rules you set, triages tasks). Closer to "openclaw takes over your Hands&amp;Claws account." Configure via skills and the agent's system prompt in your openclaw workspace.</li>
        </ul>
      </div>

      <div style={S.card}>
        <div style={{ ...S.stepTitle, marginBottom: 10 }}>Revoking access</div>
        <p style={S.sub}>
          Click <strong>Rotate</strong> next to your token above to generate a new one.
          The old token stops working immediately — update <code>~/.openclaw/openclaw.json</code> with the new value and restart openclaw.
          Your browser login session is unaffected.
        </p>
      </div>
    </div>
  )
}
