import { useChatStore } from '../store/chatStore'

const TYPE_DOT = {
  agent:    { bg: '#f59e0b', label: 'C' },
  fallback: { bg: '#7c3aed', label: 'F' },
  human:    { bg: '#22c55e', label: 'H' },
}

export default function OperatorDot({ size = 18, style: sx, participantType }) {
  const ocMode = useChatStore(s => s.ocMode)
  const resolved = participantType ?? (ocMode === true ? 'agent' : 'human')
  const { bg, label } = TYPE_DOT[resolved] ?? TYPE_DOT.human

  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: bg,
      display: 'inline-flex', flexShrink: 0,
      alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.54), fontWeight: 700,
      color: '#fff', lineHeight: 1, userSelect: 'none',
      ...sx,
    }}>
      {label}
    </span>
  )
}
