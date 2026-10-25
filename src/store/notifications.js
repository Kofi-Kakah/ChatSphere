import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useNotificationStore = create(
  persist(
    (set, get) => ({
      unread: {},
      totalUnread: 0,
      soundEnabled: true,
      desktopEnabled: false,
      setUnread: (convId, count) => {
        const unread = { ...get().unread, [convId]: count }
        const total = Object.values(unread).reduce((a, b) => a + b, 0)
        set({ unread, totalUnread: total })
        document.title = total > 0 ? `(${total}) ChatSphere` : 'ChatSphere'
      },
      incrementUnread: (convId) => {
        const cur = get().unread[convId] || 0
        get().setUnread(convId, cur + 1)
      },
      clearUnread: (convId) => get().setUnread(convId, 0),
      setSound: (v) => set({ soundEnabled: v }),
      setDesktop: (v) => set({ desktopEnabled: v }),
      requestDesktopPermission: async () => {
        if (!('Notification' in window)) return
        const perm = await Notification.requestPermission()
        set({ desktopEnabled: perm === 'granted' })
      },
    }),
    { name: 'chatsphere-notifications' },
  ),
)
