import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { generatePalette, cssVarName } from './palette'
import { ThemeProvider } from './ThemeProvider'
import { applyTheme } from './apply'

const root = () => document.documentElement

afterEach(() => root().removeAttribute('style'))

describe('applyTheme', () => {
  it('writes the palette as CSS custom properties on the element', () => {
    const el = document.createElement('div')
    applyTheme(el, { accent: '#2e86ab' }, 'light')
    const p = generatePalette({ accent: '#2e86ab' }, 'light')
    expect(el.style.getPropertyValue(cssVarName('primary'))).toBe(p.colors.primary)
    expect(el.style.getPropertyValue(cssVarName('surfaceContainer'))).toBe(p.colors.surfaceContainer)
  })
})

describe('ThemeProvider', () => {
  it('applies the chosen scheme to the document element', () => {
    render(<ThemeProvider accent="#e4572e" scheme="dark"><p>hi</p></ThemeProvider>)
    expect(root().style.getPropertyValue('--color-primary')).toBe(
      generatePalette({ accent: '#e4572e' }, 'dark').colors.primary,
    )
    expect(root().dataset.scheme).toBe('dark')
  })

  it('re-applies when the accent changes', () => {
    const { rerender } = render(<ThemeProvider accent="#e4572e" scheme="light"><p>hi</p></ThemeProvider>)
    rerender(<ThemeProvider accent="#2e86ab" scheme="light"><p>hi</p></ThemeProvider>)
    expect(root().style.getPropertyValue('--color-primary')).toBe(
      generatePalette({ accent: '#2e86ab' }, 'light').colors.primary,
    )
  })
})
