import { useChatStore } from '../store/chatStore'

export default function OperatorDot({ size = 18, style: sx, participantType }) {
  const ocMode = useChatStore(s => s.ocMode)
  const isOc   = participantType !== undefined ? participantType === 'agent' : ocMode === true

  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: isOc ? '#f59e0b' : '#22c55e',
      display: 'inline-flex', flexShrink: 0,
      alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.54), fontWeight: 700,
      color: '#fff', lineHeight: 1, userSelect: 'none',
      ...sx,
    }}>
      {isOc ? 'C' : 'H'}
    </span>
  )
}
