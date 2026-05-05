import React from 'react'
import { useTheme } from '../hooks/useTheme'

function BrandLogo() {
  const T = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
      <img src="/logo.png" width="36" height="36" alt="" aria-hidden="true" />
      <span style={{ fontWeight: 600, fontSize: 18, color: T.ink, letterSpacing: '-0.01em' }}>Hands&amp;Claws</span>
    </div>
  )
}

export function AuthLayout({ title, children }) {
  const T = useTheme()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: T.bg }}>
      <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: '36px 32px', width: '100%', maxWidth: 380 }}>
        <BrandLogo />
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24, textAlign: 'center', color: T.ink }}>{title}</h1>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, ...props }) {
  const T = useTheme()
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, color: T.ink3, marginBottom: 5 }}>{label}</label>
      <input style={{
        width: '100%', padding: '9px 12px', fontSize: 14,
        border: `1px solid ${T.inputBorder}`, borderRadius: 7, outline: 'none',
        transition: 'border-color .15s', boxSizing: 'border-box',
        background: T.inputBg, color: T.ink,
      }} {...props} />
    </div>
  )
}

export function SubmitBtn({ loading, children }) {
  return (
    <button type="submit" style={{
      width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 500,
      background: '#0070f3', color: '#fff', border: 'none', borderRadius: 7,
      cursor: 'pointer', marginTop: 8, transition: 'opacity .15s',
      opacity: loading ? 0.6 : 1,
    }} disabled={loading}>
      {loading ? 'Please wait…' : children}
    </button>
  )
}

export function FormError({ children }) {
  return (
    <div style={{
      fontSize: 13, color: '#c00', background: '#fff0f0',
      border: '1px solid #fcc', borderRadius: 6,
      padding: '8px 12px', marginBottom: 12,
    }}>{children}</div>
  )
}
