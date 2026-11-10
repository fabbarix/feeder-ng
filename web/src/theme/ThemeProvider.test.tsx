import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { COLOR_ALIASES, COLOR_TOKENS, STATUS_NAMES, cssVarName, generatePalette, statusVarName } from './palette'
import { ThemeProvider } from './ThemeProvider'
import { applyTheme } from './apply'

const root = () => document.documentElement

afterEach(() => {
  root().removeAttribute('style')
  root().removeAttribute('data-scheme')
})

describe('applyTheme', () => {
  it('writes every new colour token as a CSS custom property', () => {
    const el = document.createElement('div')
    applyTheme(el, { accent: '#2e86ab' }, 'light')
    const p = generatePalette({ accent: '#2e86ab' }, 'light')
    for (const t of COLOR_TOKENS) expect(el.style.getPropertyValue(cssVarName(t)), t).toBe(p.colors[t])
    expect(el.style.getPropertyValue('--color-surface-2')).toBe(p.colors.surface2)
    expect(el.style.getPropertyValue('--color-on-accent')).toBe(p.colors.onAccent)
  })

  it('also writes the old variable names as aliases (one release)', () => {
    const el = document.createElement('div')
    applyTheme(el, { accent: '#2e86ab' }, 'dark')
    const p = generatePalette({ accent: '#2e86ab' }, 'dark')
    for (const [old, token] of Object.entries(COLOR_ALIASES)) {
      expect(el.style.getPropertyValue(`--color-${old}`), old).toBe(p.colors[token])
    }
    expect(el.style.getPropertyValue('--color-primary')).toBe(p.colors.accent)
    expect(el.style.getPropertyValue('--color-surface-container')).toBe(p.colors.surface2)
    expect(el.style.getPropertyValue('--color-on-surface')).toBe(p.colors.text)
  })

  it('writes the status variables for the active scheme', () => {
    const el = document.createElement('div')
    applyTheme(el, { accent: '#3f7d58' }, 'dark')
    const p = generatePalette({ accent: '#3f7d58' }, 'dark')
    for (const n of STATUS_NAMES) {
      for (const part of ['fg', 'bg', 'solid'] as const) {
        expect(el.style.getPropertyValue(statusVarName(n, part)), `${n}-${part}`).toBe(p.status[n][part])
      }
    }
    expect(el.style.getPropertyValue('--status-spoil-bg')).toBe('#44250c')
  })

  it('switching scheme replaces the values, and sets color-scheme and data-scheme', () => {
    const el = document.createElement('div')
    applyTheme(el, { accent: '#3f7d58' }, 'light')
    const light = el.style.getPropertyValue('--color-bg')
    applyTheme(el, { accent: '#3f7d58' }, 'dark')
    expect(el.style.getPropertyValue('--color-bg')).not.toBe(light)
    expect(el.style.getPropertyValue('--status-spoil-bg')).toBe('#44250c')
    expect(el.style.colorScheme).toBe('dark')
    expect(el.dataset.scheme).toBe('dark')
  })
})

describe('ThemeProvider', () => {
  it('applies the chosen scheme to the document element, new and alias variables', () => {
    render(<ThemeProvider accent="#e4572e" scheme="dark"><p>hi</p></ThemeProvider>)
    const p = generatePalette({ accent: '#e4572e' }, 'dark')
    expect(root().style.getPropertyValue('--color-accent')).toBe(p.colors.accent)
    expect(root().style.getPropertyValue('--color-primary')).toBe(p.colors.accent)
    expect(root().dataset.scheme).toBe('dark')
  })

  it('re-applies when the accent changes', () => {
    const { rerender } = render(<ThemeProvider accent="#e4572e" scheme="light"><p>hi</p></ThemeProvider>)
    rerender(<ThemeProvider accent="#2e86ab" scheme="light"><p>hi</p></ThemeProvider>)
    expect(root().style.getPropertyValue('--color-accent')).toBe(generatePalette({ accent: '#2e86ab' }, 'light').colors.accent)
  })
})
