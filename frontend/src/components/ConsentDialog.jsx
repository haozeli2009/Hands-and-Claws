import React from 'react'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../hooks/useTheme'

export default function ConsentDialog({ consent, send }) {
  const T            = useTheme()
  const token        = useAuthStore(s => s.token)
  const clearConsent = useChatStore(s => s.clearConsent)
  const addMsg       = useChatStore(s => s.addMessage)

  function reply(yes) {
    send({ type: 'consent_reply', cid: consent.cid, consent_type: consent.type, yes })
    addMsg(
      'system',
      yes
        ? (consent.type === 'data' ? 'Data shared — finding a match…' : 'Task accepted.')
        : (consent.type === 'data' ? 'Data sharing declined.'         : 'Task declined.'),
      token,
      consent.cid,
    )
    clearConsent()
  }

  const isData = consent.type === 'data'

  return (
    <div style={{ padding: '16px 20px', borderTop: `1px solid ${T.line}`, background: T.surface, flexShrink: 0 }}>
      <div style={{ background: T.blueSoft, border: `1px solid ${T.line}`, borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0050b3', marginBottom: 8,
                      textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {isData ? 'Data sharing consent' : 'Task request'}
        </div>

        {isData ? (
          <>
            <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.55, marginBottom: 14, whiteSpace: 'pre-wrap' }}>
              <strong>Your intent:</strong> {consent.intent}{'\n\n'}
              <strong>Data to share:</strong> {consent.data || '(none)'}
            </div>
            <div style={{ fontSize: 12, color: T.ink3, marginBottom: 12 }}>
              This data will be shared temporarily to find a match. It is not stored.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.55, marginBottom: 14 }}>
            {consent.task}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 500,
                           background: '#0070f3', color: '#fff', border: 'none',
                           borderRadius: 7, cursor: 'pointer' }}
                  onClick={() => reply(true)}>
            {isData ? 'Yes, share data' : 'Accept task'}
          </button>
          <button style={{ flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 500,
                           background: T.surface2, color: T.ink3,
                           border: `1px solid ${T.btnBorder}`, borderRadius: 7, cursor: 'pointer' }}
                  onClick={() => reply(false)}>
            {isData ? 'No, cancel' : 'Decline'}
          </button>
        </div>
      </div>
    </div>
  )
}
