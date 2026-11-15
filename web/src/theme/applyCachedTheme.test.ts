// B9-49 (RES-08): main.tsx calls applyCachedTheme(document.documentElement, prefersDark) before createRoot, so the full token set is already
// the User's when React renders its first frame (the inline script of index.html only paints the six boot colours). It returns whether a
// cached theme was applied; with none it touches nothing.
import { beforeEach, describe, expect, it } from 'vitest'
import { applyCachedTheme } from './applyCachedTheme'
import { buildThemeCache, writeThemeCache } from './themeCache'

const read = (name: string) => document.documentElement.style.getPropertyValue(name)
beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-scheme')
  document.documentElement.removeAttribute('data-boot')
})

describe('applyCachedTheme', () => {
  it('with no cached theme it does nothing and says so', () => {
    expect(applyCachedTheme(document.documentElement, false)).toBe(false)
    expect(document.documentElement.dataset.scheme).toBeUndefined()
    expect(read('--color-bg')).toBe('')
  })

  it('applies the whole token set of the cached accent in the cached scheme', () => {
    writeThemeCache(buildThemeCache({ scheme: 'dark', accent: '#d9503f' }))
    expect(applyCachedTheme(document.documentElement, false)).toBe(true)
    expect(document.documentElement.dataset.scheme).toBe('dark')
    expect(read('--color-bg')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(read('--color-surface-2')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(read('--status-danger-solid')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('"system" follows the OS scheme it is given', () => {
    writeThemeCache(buildThemeCache({ scheme: 'system', accent: '#d9503f' }))
    applyCachedTheme(document.documentElement, true)
    expect(document.documentElement.dataset.scheme).toBe('dark')
    applyCachedTheme(document.documentElement, false)
    expect(document.documentElement.dataset.scheme).toBe('light')
  })

  it('keeps the boot ground (--boot-bg) on the theme applied since, so a scheme changed later is not left behind the page', async () => {
    const { applyTheme } = await import('./apply')
    const root = document.documentElement
    writeThemeCache(buildThemeCache({ scheme: 'dark', accent: '#d9503f' }))
    root.dataset.boot = 'shell'
    applyCachedTheme(root, false)
    expect(read('--boot-bg')).toBe(read('--color-bg'))
    applyTheme(root, { accent: '#d9503f' }, 'light')
    expect(read('--boot-bg')).toBe(read('--color-bg'))
    root.removeAttribute('data-boot')
    root.style.removeProperty('--boot-bg')
    applyTheme(root, { accent: '#d9503f' }, 'dark')
    expect(read('--boot-bg')).toBe('') // a first visit (no boot shell) gets no boot ground
  })
})
