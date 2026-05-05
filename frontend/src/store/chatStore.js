import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function apiPost(path, body, token) {
  if (!token) return
  fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).catch(() => {})
}

function apiDelete(path, token) {
  if (!token) return
  fetch(path, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})
}

export const useChatStore = create(
  persist(
    (set, get) => ({
      messages:        [],
      pendingConsent:  null,
      statusMessage:   null,
      pipeline:        [],   // current active pipeline steps
      processing:      false,
      activeCid:       null, // currently viewed task thread (null = general / new)
      newChatAt:       null, // timestamp set by startNewChat; null = show all history
      pendingUserMsgId: null, // id of most recent user msg awaiting a cid tag
      pendingRatings:  [],   // { cid, rated_uid, rated_name }
      activeThinkingId: null, // id of the live thinking bubble for the current request
      ocMode:          false, // true | 'paused' | false
      ocConnectedAt:   null, // ISO ts of last plugin connect
      ocDisconnectedAt:null, // ISO ts of last plugin disconnect
      ocIoLog:         [],   // { id, ts, direction:'in'|'out', type, payload }

      addMessage(role, text, token, cid = null, id = null) {
        const msgId = id || (Math.random().toString(36).slice(2) + Date.now().toString(36))
        const ts  = new Date().toISOString()
        const msg = { id: msgId, role, text, ts, cid: cid || null }
        // processing is managed by clearPipeline / upsertPipelineStep / stopProcessing.
        // Do NOT reset it here — an agent message arriving mid-pipeline (e.g. a
        // status_update "Stopped." from a previous cancel) must not clear the lock.
        set(s => {
          // Drop duplicate: if a message with this id already exists (e.g. a second
          // tab already added it), skip the insert but still return the id.
          if (msgId && s.messages.some(m => m.id === msgId)) return s
          return { messages: [...s.messages, msg] }
        })
        if (role !== 'thinking' && role !== 'stopped' && token) {
          apiPost('/api/history/messages', { id: msgId, role, text, ts, cid: cid || '' }, token)
        }
        return msgId
      },

      // Retro-tag the most recent pending user message with the cid the
      // backend assigned, and switch the view to that thread. Re-tagging
      // handles the case where the message was sent with an activeCid
      // but the backend assigned a different cid.
      tagPendingUserMessage(cid, token) {
        if (!cid) return
        set(s => {
          const pid = s.pendingUserMsgId
          if (!pid) return { activeCid: cid }
          const target = s.messages.find(m => m.id === pid)
          if (!target) return { activeCid: cid, pendingUserMsgId: null }
          // Retag user message and also move the thinking placeholder into the same thread
          // so it stays visible after activeCid switches to the new cid.
          const thinkId = s.activeThinkingId
          let messages = s.messages.map(m => {
            if (m.id === pid && m.cid !== cid) return { ...m, cid }
            if (m.id === thinkId && m.cid !== cid) return { ...m, cid }
            return m
          })
          if (target.cid !== cid && token) {
            apiPost('/api/history/messages',
              { id: target.id, role: target.role, text: target.text,
                ts: target.ts, cid },
              token)
          }
          return { messages, activeCid: cid, pendingUserMsgId: null }
        })
      },

      // Update the live thinking bubble in-place, or create one if missing.
      upsertThinking(text, cid) {
        set(s => {
          if (s.activeThinkingId) {
            return {
              messages: s.messages.map(m =>
                m.id === s.activeThinkingId ? { ...m, text } : m
              ),
            }
          }
          const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
          return {
            activeThinkingId: id,
            messages: [...s.messages, {
              id, role: 'thinking', text,
              ts: new Date().toISOString(), cid: cid || null,
            }],
          }
        })
      },

      setPendingUserMsgId(id) { set({ pendingUserMsgId: id }) },

      setActiveCid(cid) { set({ activeCid: cid }) },

      setPendingConsent(payload) { set({ pendingConsent: payload }) },
      clearConsent()             { set({ pendingConsent: null }) },

      addRatingPrompt(prompt) {
        set(s => ({
          pendingRatings: [
            ...s.pendingRatings.filter(
              r => !(r.cid === prompt.cid && r.rated_uid === prompt.rated_uid)
            ),
            prompt,
          ],
        }))
      },
      dismissRatingPrompt(cid, rated_uid) {
        set(s => ({
          pendingRatings: s.pendingRatings.filter(
            r => !(r.cid === cid && r.rated_uid === rated_uid)
          ),
        }))
      },

      addOcIoEntry(entry) {
        set(s => ({ ocIoLog: [...s.ocIoLog.slice(-499), entry] }))
      },
      clearOcIoLog() { set({ ocIoLog: [] }) },

      setStatus(payload) { set({ statusMessage: payload }) },
      clearStatus()      { set({ statusMessage: null }) },

      upsertPipelineStep(step) {
        set(s => {
          const idx = s.pipeline.findIndex(p => p.id === step.id)
          const autoExpand = step.status === 'done' && step.extra?.accepted === true
          const merged = idx >= 0
            ? { ...s.pipeline[idx], ...step,
                extra:    { ...(s.pipeline[idx].extra || {}), ...(step.extra || {}) },
                expanded: autoExpand ? true : s.pipeline[idx].expanded }
            : { ...step, ts: new Date().toISOString(), expanded: autoExpand, extra: step.extra || {} }
          const pipeline = idx >= 0
            ? s.pipeline.map((p, i) => i === idx ? merged : p)
            : [...s.pipeline, merged]
          const allSettled = pipeline.length > 0 && pipeline.every(p => p.status !== 'running')
          return { pipeline, ...(allSettled ? { processing: false } : {}) }
        })
      },

      togglePipelineStep(id) {
        set(s => ({
          pipeline: s.pipeline.map(p => p.id === id ? { ...p, expanded: !p.expanded } : p),
        }))
      },

      // Toggle folded state of an archived pipeline message
      togglePipelineMessage(id) {
        set(s => ({
          messages: s.messages.map(m =>
            m.id === id && m.role === 'pipeline' ? { ...m, folded: !m.folded } : m
          ),
        }))
      },

      // Add the thinking placeholder immediately after the user message.
      // Called from ChatPage.sendMessage() right after addMessage('user', ...).
      addThinkingPlaceholder(cid) {
        const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
        set(s => ({
          activeThinkingId: id,
          messages: [...s.messages, {
            id, role: 'thinking', text: '',
            ts: new Date().toISOString(), cid: cid || null,
          }],
        }))
      },

      clearPipeline() {
        set(s => {
          // Only archive settled pipelines — if any step is still running the
          // pipeline is mid-flight and archiving a partial snapshot is misleading.
          const settled = s.pipeline.length > 0 && s.pipeline.every(p => p.status !== 'running')
          const pipelineMsg = settled ? {
            id:     Math.random().toString(36).slice(2) + Date.now().toString(36),
            role:   'pipeline',
            steps:  s.pipeline,
            folded: true,
            ts:     new Date().toISOString(),
            cid:    s.activeCid || null,
          } : null
          return {
            pipeline:         [],
            processing:       true,
            activeThinkingId: null,
            messages:         pipelineMsg ? [...s.messages, pipelineMsg] : s.messages,
          }
        })
      },

      stopProcessing() {
        set(s => {
          // Archive the partial pipeline so it isn't silently discarded on Stop.
          const pipelineMsg = s.pipeline.length > 0 ? {
            id:     Math.random().toString(36).slice(2) + Date.now().toString(36),
            role:   'pipeline',
            steps:  s.pipeline,
            folded: true,
            ts:     new Date().toISOString(),
            cid:    s.activeCid || null,
          } : null
          // Drop placeholder thinking bubble if LLM never sent any thinking text
          const messages = s.messages.filter(m => !(m.id === s.activeThinkingId && !m.text))
          return {
            pipeline:         [],
            processing:       false,
            activeThinkingId: null,
            messages:         pipelineMsg ? [...messages, pipelineMsg] : messages,
          }
        })
      },

      reset() {
        set({ messages: [], pendingConsent: null, statusMessage: null,
              pipeline: [], processing: false,
              activeCid: null, newChatAt: null, pendingUserMsgId: null, activeThinkingId: null })
      },

      // "New chat": drop orphan (cid-less) messages locally, clear ephemeral
      // state, and tell the backend to forget the same rows so a page refresh
      // stays blank. Task-tagged messages (those with a cid) are preserved —
      // they're reachable from the task sidebar.
      startNewChat(token) {
        set(s => ({
          messages:         s.messages.filter(m => !!m.cid),
          pipeline:         [],
          pendingConsent:   null,
          statusMessage:    null,
          pendingUserMsgId: null,
          processing:       false,
          activeCid:        null,
          newChatAt:        new Date().toISOString(),
          activeThinkingId: null,
        }))
        apiDelete('/api/history/messages/orphans', token)
      },
    }),
    {
      name: 'chat-store',
      // Don't persist ephemeral roles; persist newChatAt so the blank-after-new-chat
      // cutoff survives a refresh. activeCid is NOT persisted — on refresh we always
      // start in the general view (null), avoiding stale thread filters.
      partialize: state => ({
        messages: state.messages.filter(m =>
          m.role !== 'stopped' && m.role !== 'thinking'
        ),
        newChatAt: state.newChatAt,
      }),
    }
  )
)
