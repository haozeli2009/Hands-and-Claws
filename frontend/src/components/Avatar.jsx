import React, { useState } from 'react'

const PALETTE = [
  '#6366f1','#8b5cf6','#ec4899','#f59e0b',
  '#10b981','#0ea5e9','#ef4444','#f97316',
]

function colorFor(uid) {
  return PALETTE[(uid ?? 0) % PALETTE.length]
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name[0].toUpperCase()
}

export default function Avatar({ uid, name, size = 32, v, style }) {
  const [broken, setBroken] = useState(false)
  const src = uid != null
    ? `/api/user/avatar/${uid}${v != null ? `?v=${v}` : ''}`
    : null
  const bg  = colorFor(uid)
  const fontSize = Math.round(size * 0.38)

  const base = {
    width: size, height: size, borderRadius: '50%',
    flexShrink: 0, overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: bg, color: '#fff',
    fontSize, fontWeight: 700, userSelect: 'none',
    ...style,
  }

  if (src && !broken) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt={name || ''}
        onError={() => setBroken(true)}
        style={{ ...base, objectFit: 'cover' }}
      />
    )
  }

  return <span style={base}>{initials(name)}</span>
}
