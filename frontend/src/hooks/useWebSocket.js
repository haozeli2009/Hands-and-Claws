import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useTaskStore } from '../store/taskStore'
import { useGroupChatStore } from '../store/groupChatStore'

const BASE_WS = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace(/^http/, 'ws')
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`

// Event types forwarded to OpenClaw (out direction) worth logging in the CLI.
const OC_OUT_TYPES = new Set([
  'data_consent', 'task_consent', 'status_update', 'pipeline_step',
  'task_card', 'thinking_update', 'rate_prompt', 'rating_saved', 'error',
  'user_info', 'task_info', 'task_list',
])

function mkIoEntry(direction, type, payload) {
  return {
    id: (payload?.mid) || (Math.random().toString(36).slice(2) + Date.now().toString(36)),
    ts: new Date().toISOString(),
    direction,
    type,
    payload,
  }
}

export function useWebSocket(token) {
  const wsRef      = useRef(null)
  const retryRef   = useRef(null)
  const mountedRef = useRef(false)
  const addMsg             = useChatStore(s => s.addMessage)
  const upsertThinking     = useChatStore(s => s.upsertThinking)
  const setConsent         = useChatStore(s => s.setPendingConsent)
  const setStatus          = useChatStore(s => s.setStatus)
  const upsertStep         = useChatStore(s => s.upsertPipelineStep)
  const tagPending         = useChatStore(s => s.tagPendingUserMessage)
  const addRatingPrompt    = useChatStore(s => s.addRatingPrompt)
  const dismissRatingPrompt = useChatStore(s => s.dismissRatingPrompt)
  const addOcIoEntry       = useChatStore(s => s.addOcIoEntry)
  const setProcessing = (v) => useChatStore.setState({ processing: v })
  const upsertTask              = useTaskStore(s => s.upsertTask)
  const updateParticipantRating = useTaskStore(s => s.updateParticipantRating)
  const addGroupMsg     = useGroupChatStore(s => s.addMessage)
  const setGroupHistory = useGroupChatStore(s => s.setHistory)

  const attachCid = (cid) => {
    if (!cid) return
    const { activeCid, pendingUserMsgId } = useChatStore.getState()
    if (pendingUserMsgId) {
      tagPending(cid, token)
    } else if (activeCid !== cid) {
      useChatStore.setState({ activeCid: cid })
    }
  }

  const connect = useCallback(() => {
    if (!token) return
    const ws = new WebSocket(`${BASE_WS}/ws/chat?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => {
      clearTimeout(retryRef.current)
    }

    ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }

      // Log events that OpenClaw also receives (out direction) when it's active.
      if (OC_OUT_TYPES.has(msg.type) && useChatStore.getState().ocMode === true) {
        addOcIoEntry(mkIoEntry('out', msg.type, msg))
      }

      switch (msg.type) {
        case 'welcome': {
          const conn = !!msg.openclaw_connected
          const ena  = msg.openclaw_enabled !== false
          const now  = new Date().toISOString()
          useChatStore.setState({
            ocMode: conn ? (ena ? true : 'paused') : false,
            ...(conn ? { ocConnectedAt: msg.openclaw_connected_at || now } : {}),
          })
          break
        }
        case 'openclaw_status': {
          const conn = !!msg.connected
          const ena  = msg.enabled !== false
          const now  = new Date().toISOString()
          useChatStore.setState({
            ocMode: conn ? (ena ? true : 'paused') : false,
            ...(conn  ? { ocConnectedAt: msg.connected_at || now } : {}),
            ...(!conn ? { ocDisconnectedAt: now }                  : {}),
          })
          break
        }
        case 'openclaw_io':
          addOcIoEntry(mkIoEntry('in', msg.payload?.type || '?', msg.payload))
          break
        case 'data_consent':
          attachCid(msg.cid)
          addMsg('system',
            `Data sharing request\n\nIntent: ${msg.intent || ''}\nData to share: ${msg.data || '(none)'}`,
            token, msg.cid, msg.mid || null)
          setConsent({ cid: msg.cid, type: 'data', data: msg.data, intent: msg.intent })
          break
        case 'task_consent':
          attachCid(msg.cid)
          addMsg('task_request', msg.task, token, msg.cid, msg.mid)
          setConsent({ cid: msg.cid, type: 'task', task: msg.task })
          break
        case 'thinking_update':
          attachCid(msg.cid)
          upsertThinking(msg.text, msg.cid)
          break
        case 'pipeline_step':
          attachCid(msg.cid)
          upsertStep({ id: msg.id, cid: msg.cid, label: msg.label, detail: msg.detail,
                       status: msg.status, extra: msg.extra || {} })
          break
        case 'task_card':
          // eslint-disable-next-line no-unused-vars
          { const { type: _, ...card } = msg; upsertTask(card, token) }
          break
        case 'group_message':
          addGroupMsg(msg.room_id, { id: msg.id, uid: msg.uid, username: msg.username,
                                     text: msg.text, ts: msg.ts, kind: msg.kind || '' })
          if (useChatStore.getState().ocMode === true) {
            addMsg('group', `[${msg.room_id.slice(0, 8)}…] ${msg.username}: ${msg.text}`,
                   token, msg.room_id, msg.id)
          }
          break
        case 'group_history':
          setGroupHistory(msg.room_id, msg.messages)
          break
        case 'status_update':
          attachCid(msg.cid)
          setStatus({ cid: msg.cid, message: msg.message })
          if (msg.message !== 'Stopped.') {
            addMsg('agent', msg.message, token, msg.cid, msg.mid)
          }
          break
        case 'rate_prompt':
          if (useChatStore.getState().ocMode !== true)
            addRatingPrompt({ cid: msg.cid, rated_uid: msg.rated_uid, rated_name: msg.rated_name })
          break
        case 'rating_saved':
          dismissRatingPrompt(msg.cid, msg.rated_uid)
          updateParticipantRating(msg.cid, msg.rated_uid, msg.rating_avg, msg.rating_count)
          break
        case 'error':
          addMsg('system', `Error: ${msg.message}`, token, null, msg.mid)
          setProcessing(false)
          break
        default:
          break
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      const delay = Math.min(30000, 1000 * 2 ** (retryRef._count || 0))
      retryRef._count = (retryRef._count || 0) + 1
      retryRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => ws.close()
  }, [token])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }, [])

  return { send }
}
