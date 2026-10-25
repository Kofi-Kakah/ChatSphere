import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = 'chatsphere-theme'

function resolveTheme(pref) {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

function applyTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved)
}

export const useThemeStore = create(
  persist(
    (set, get) => ({
      preference: 'system',
      resolved: resolveTheme('system'),
      setPreference: (pref) => {
        const resolved = resolveTheme(pref)
        applyTheme(resolved)
        set({ preference: pref, resolved })
      },
      sync: () => {
        const resolved = resolveTheme(get().preference)
        applyTheme(resolved)
        set({ resolved })
      },
    }),
    { name: STORAGE_KEY, partialize: (s) => ({ preference: s.preference }) },
  ),
)

// init
if (typeof window !== 'undefined') {
  const store = useThemeStore.getState()
  applyTheme(store.resolved)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().preference === 'system') {
      useThemeStore.getState().sync()
    }
  })
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      try {
        const parsed = JSON.parse(e.newValue || '{}')
        const pref = parsed?.state?.preference || 'system'
        useThemeStore.getState().setPreference(pref)
      } catch {}
    }
  })
}
