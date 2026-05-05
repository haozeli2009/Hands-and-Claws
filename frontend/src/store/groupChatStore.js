import { create } from 'zustand'

export const useGroupChatStore = create((set, get) => ({
  activeRoom: null,   // card_id of the currently open group chat
  rooms: {},          // { [room_id]: { messages: [], unread: 0 } }

  openRoom(room_id) {
    set(s => ({
      activeRoom: room_id,
      rooms: {
        ...s.rooms,
        [room_id]: { messages: s.rooms[room_id]?.messages || [], unread: 0 },
      },
    }))
  },

  closeRoom() { set({ activeRoom: null }) },

  addMessage(room_id, msg) {
    set(s => {
      const room = s.rooms[room_id] || { messages: [], unread: 0 }
      if (msg.id && room.messages.some(m => m.id === msg.id)) return s
      const isActive = s.activeRoom === room_id
      return {
        rooms: {
          ...s.rooms,
          [room_id]: {
            messages: [...room.messages, msg],
            unread:   isActive ? 0 : room.unread + 1,
          },
        },
      }
    })
  },

  setHistory(room_id, messages) {
    set(s => {
      const existing = s.rooms[room_id]?.messages || []
      const ids = new Set(messages.map(m => m.id).filter(Boolean))
      const extras = existing.filter(m => m.id && !ids.has(m.id))
      return {
        rooms: {
          ...s.rooms,
          [room_id]: { messages: [...messages, ...extras], unread: 0 },
        },
      }
    })
  },

  markRead(room_id) {
    set(s => ({
      rooms: {
        ...s.rooms,
        [room_id]: { ...(s.rooms[room_id] || { messages: [] }), unread: 0 },
      },
    }))
  },
}))
