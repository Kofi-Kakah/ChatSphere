import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from './theme.js'
import { setSystemDark } from '../test/setup.js'

beforeEach(() => {
  setSystemDark(false)
  localStorage.clear()
  useThemeStore.getState().setPreference('system')
})

describe('theme store', () => {
  it('resolves the system preference to light when the OS is light', () => {
    const state = useThemeStore.getState()
    expect(state.preference).toBe('system')
    expect(state.resolved).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('applies dark immediately and persists the preference', () => {
    useThemeStore.getState().setPreference('dark')
    expect(useThemeStore.getState().resolved).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    const stored = JSON.parse(localStorage.getItem('chatsphere-theme'))
    expect(stored.state.preference).toBe('dark')
  })

  it('applies an explicit light preference even when the OS is dark', () => {
    setSystemDark(true)
    useThemeStore.getState().setPreference('light')
    expect(useThemeStore.getState().resolved).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('resolves the system preference to dark when the OS is dark', () => {
    setSystemDark(true)
    useThemeStore.getState().setPreference('system')
    expect(useThemeStore.getState().resolved).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('follows OS changes live while the preference is system', () => {
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    setSystemDark(true)
    expect(useThemeStore.getState().resolved).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    setSystemDark(false)
    expect(useThemeStore.getState().resolved).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('does not follow OS changes after an explicit preference is chosen', () => {
    useThemeStore.getState().setPreference('light')
    setSystemDark(true)
    expect(useThemeStore.getState().resolved).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('syncs a preference changed in another tab', () => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'chatsphere-theme',
        newValue: JSON.stringify({ state: { preference: 'dark' }, version: 0 }),
      }),
    )

    expect(useThemeStore.getState().preference).toBe('dark')
    expect(useThemeStore.getState().resolved).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('ignores storage events for unrelated keys', () => {
    useThemeStore.getState().setPreference('dark')
    window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-key', newValue: 'value' }))
    expect(useThemeStore.getState().preference).toBe('dark')
  })
})
