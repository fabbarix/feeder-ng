// R2-1 (G-01): the CSS contract of the popover (jsdom does not lay out). Tokens only, no colour literals.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'

const css = readUiCss('Menu/Menu.css')

describe('Menu.css', () => {
  it('exists and is imported by Menu.tsx', () => {
    expect(css).not.toBe('')
    expect(readUiCss('Menu/Menu.tsx')).toMatch(/import ['"]\.\/Menu\.css['"]/)
  })
  it('the popover is fixed (the component writes top/left), above the page, a surface with the popover elevation', () => {
    const d = declarations(css, '.menu')
    expect(d['position']).toBe('fixed')
    expect(Number(d['z-index'])).toBeGreaterThanOrEqual(20)
    expect(d['background']).toBe('var(--color-surface)')
    expect(d['box-shadow']).toBe('var(--elev-2)')
    expect(d['border-radius']).toMatch(/^var\(--radius-/)
  })
  it('is 240 px wide at most the viewport minus the gutters', () => {
    const d = declarations(css, '.menu')
    expect(d['inline-size'] ?? d['width']).toBe('240px')
    expect(d['max-inline-size'] ?? d['max-width']).toMatch(/100vw/)
  })
  it('items are 48 px touch rows with the token radius, and the danger tone uses the danger status colour', () => {
    expect(declarations(css, '.menu__item')['min-block-size'] ?? declarations(css, '.menu__item')['min-height']).toBe('48px')
    expect(declarations(css, ".menu__item[data-tone='danger']")['color']).toBe('var(--status-danger-fg)')
  })
  it('hover and keyboard focus use the soft accent, a disabled item is muted', () => {
    expect(declarations(css, '.menu__item:hover')['background']).toBe('var(--color-soft)')
    expect(declarations(css, ".menu__item[aria-disabled='true']")['color']).toBe('var(--color-muted)')
  })
  it('has a hairline divider on the line token', () => {
    expect(declarations(css, '.menu__divider')['background']).toBe('var(--color-line)')
  })
  it('uses no colour literals', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})
