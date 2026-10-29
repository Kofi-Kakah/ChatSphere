import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

let systemDark = false
const themeListeners = new Set()

export function createMatchMedia() {
  return (query) => {
    const themeQuery = query.includes('prefers-color-scheme: dark')
    return {
      get matches() {
        return themeQuery ? systemDark : false
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (type, listener) => {
        if (themeQuery && type === 'change') themeListeners.add(listener)
      },
      removeEventListener: (type, listener) => {
        if (themeQuery && type === 'change') themeListeners.delete(listener)
      },
      dispatchEvent: vi.fn(),
    }
  }
}

export function setSystemDark(value) {
  systemDark = value
  for (const listener of themeListeners) listener({ matches: value })
}

window.matchMedia = createMatchMedia()

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = window.ResizeObserver || ResizeObserverMock

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  systemDark = false
})
