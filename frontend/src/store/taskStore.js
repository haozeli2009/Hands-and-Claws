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

export const useTaskStore = create(
  persist(
    (set) => ({
      tasks: [],

      upsertTask(card, token) {
        set(s => {
          const idx = s.tasks.findIndex(t => t.card_id === card.card_id)

          if (idx >= 0) {
            const existing = s.tasks[idx]

            let participants = card.participants ?? existing.participants ?? []
            if (card.finished_uid !== undefined) {
              participants = (existing.participants ?? []).map(p =>
                p.uid === card.finished_uid ? { ...p, status: 'finished' } : p
              )
            }
            if (card.new_participant !== undefined) {
              const np = card.new_participant
              if (!participants.some(p => p.uid === np.uid)) {
                participants = [...participants, np]
              }
            }

            let peers = card.peers ?? existing.peers ?? []
            if (card.finished_peer_uid !== undefined) {
              peers = (existing.peers ?? []).map(p =>
                p.uid === card.finished_peer_uid ? { ...p, status: 'finished' } : p
              )
            }

            const { finished_uid: _f, finished_peer_uid: _p, new_participant: _np, ...rest } = card
            const merged = {
              ...existing,
              ...rest,
              participants,
              peers,
              demand_uid:  card.demand_uid  ?? existing.demand_uid,
              demand_info: card.demand_info ?? existing.demand_info,
            }
            const updated = [...s.tasks]
            updated[idx] = merged
            if (token) apiPost('/api/history/tasks', merged, token)
            return { tasks: updated }
          }

          const { finished_uid: _f, finished_peer_uid: _p, ...rest } = card
          const newCard = {
            ...rest,
            ts:           new Date().toISOString(),
            participants: card.participants ?? [],
            peers:        card.peers        ?? [],
            demand_uid:   card.demand_uid,
            demand_info:  card.demand_info,
          }
          if (token) apiPost('/api/history/tasks', newCard, token)
          return { tasks: [newCard, ...s.tasks] }
        })
      },

      updateParticipantRating(cid, rated_uid, rating_avg, rating_count) {
        set(s => ({
          tasks: s.tasks.map(t => {
            if (t.card_id !== cid) return t
            const patch = p => p.uid === rated_uid
              ? { ...p, rating_avg, rating_count }
              : p
            return {
              ...t,
              participants: (t.participants || []).map(patch),
              peers:        (t.peers        || []).map(patch),
              demand_info:  t.demand_info?.uid === rated_uid
                ? { ...t.demand_info, rating_avg, rating_count }
                : t.demand_info,
            }
          }),
        }))
      },

      removeTask(card_id, token) {
        if (token) apiDelete(`/api/history/tasks/${card_id}`, token)
        set(s => ({ tasks: s.tasks.filter(t => t.card_id !== card_id) }))
      },

      clearAll() { set({ tasks: [] }) },
    }),
    {
      name: 'task-store',
    }
  )
)
