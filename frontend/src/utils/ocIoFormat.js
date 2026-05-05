// Formats a single ocIoLog entry into a short human-readable CLI line.
export function formatIoLine({ type, payload }) {
  const p = payload || {}
  const short = (s, n = 60) => s && s.length > n ? s.slice(0, n) + '…' : (s || '')
  const cid8  = (c) => c ? c.slice(0, 8) : '?'

  switch (type) {
    case 'user_message':
      return `user_message  "${short(p.text, 72)}"`
    case 'consent_reply':
      return `consent_reply  ${p.yes ? 'YES' : 'NO'}  (${p.consent_type}:${cid8(p.cid)})`
    case 'finish_task':
      return `finish_task  cid:${cid8(p.cid)}`
    case 'cancel':
      return `cancel`
    case 'get_info':
      return `/info`
    case 'get_task':
      return `/task${p.cid ? `  cid:${cid8(p.cid)}` : ''}`
    case 'get_list':
      return `/getlist  "${short(p.demand, 50)}"`
    case 'submit_rating':
      return `submit_rating  uid:${p.rated_uid}  score:${p.score}`
    case 'group_message':
      return `group_message  [${cid8(p.room_id)}]  "${short(p.text, 50)}"`
    case 'fetch_group':
      return `fetch_group  [${cid8(p.room_id)}]`

    case 'data_consent':
      return `data_consent  (${cid8(p.cid)})  intent:"${short(p.intent, 50)}"`
    case 'task_consent':
      return `task_consent  (${cid8(p.cid)})`
    case 'status_update':
      return `status_update  "${short(p.message, 72)}"`
    case 'pipeline_step':
      return `pipeline_step  [${p.status || '?'}]  ${short(p.label, 30)}${p.detail ? ': ' + short(p.detail, 30) : ''}`
    case 'task_card':
      return `task_card  cid:${cid8(p.card_id)}  role:${p.role || '?'}${p.status ? '  status:' + p.status : ''}`
    case 'thinking_update':
      return `thinking_update  "${short(p.text, 60)}"`
    case 'rate_prompt':
      return `rate_prompt  cid:${cid8(p.cid)}  rated:${p.rated_name || p.rated_uid}`
    case 'error':
      return `error  "${short(p.message, 72)}"`

    case 'user_info':
      return `user_info  uid:${p.uid}  ${p.username}  demand:${p.demand_status || '?'}  tasks:${(p.active_cids || []).length}`
    case 'task_info':
      return `task_info  cid:${cid8((p.card || {}).card_id)}  role:${(p.card || {}).role || '?'}`
    case 'task_list':
      return `task_list  ${(p.cards || []).length} card(s)`

    default:
      return `${type}`
  }
}
