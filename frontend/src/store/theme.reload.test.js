import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const noFlashScript = indexHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1]

const storedDark = JSON.stringify({ state: { preference: 'dark' }, version: 0 })

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme persistence across reloads', () => {
  it('keeps the system default when nothing is stored', async () => {
    const { useThemeStore } = await import('./theme.js')
    expect(useThemeStore.getState().preference).toBe('system')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('MODE-003: restores and applies the stored preference on reload', async () => {
    localStorage.setItem('chatsphere-theme', storedDark)

    const { useThemeStore } = await import('./theme.js')

    expect(useThemeStore.getState().preference).toBe('dark')
    expect(useThemeStore.getState().resolved).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('MODE-004: applies the stored preference before the app bundle runs (no flash)', () => {
    localStorage.setItem('chatsphere-theme', storedDark)

    new Function(noFlashScript)()

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
