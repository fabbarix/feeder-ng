// CSS contract of ui/Sortable (jsdom does not lay out; docs/dev/design/sort-drag.md sections 2.4 and 6). Tokens only.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'

const css = readUiCss('Sortable/Sortable.css')
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('Sortable.css', () => {
  it('exists and is imported by Sortable.tsx', () => {
    expect(css).not.toBe('')
    expect(readUiCss('Sortable/Sortable.tsx')).toMatch(/import ['"]\.\/Sortable\.css['"]/)
  })
  it('uses tokens only: no colour literals', () => {
    expect(bare).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(bare).not.toMatch(/\b(rgb|hsl)a?\(/)
  })
})

describe('the handle', () => {
  it('turns off browser touch handling on the handle only, so a finger on it drags and a finger anywhere else scrolls', () => {
    const d = declarations(css, '.sortable-handle')
    expect(d['touch-action']).toBe('none')
    expect(declarations(css, '.sortable__item')['touch-action']).toBeUndefined()
    expect(declarations(css, '.sortable')['touch-action']).toBeUndefined()
  })
  it('is a 44 px touch target', () => {
    const d = declarations(css, '.sortable-handle')
    expect(d['min-inline-size'] ?? d['inline-size']).toBe('44px')
    expect(d['min-block-size'] ?? d['block-size']).toBe('44px')
  })
  it('shows a grab cursor, never selects text and suppresses the iOS callout', () => {
    const d = declarations(css, '.sortable-handle')
    expect(d['cursor']).toBe('grab')
    expect(d['user-select']).toBe('none')
    expect(d['-webkit-touch-callout']).toBe('none')
  })
  it('has a token focus ring', () => {
    expect(declarations(css, '.sortable-handle:focus-visible')['outline']).toMatch(/var\(--color-accent\)/)
  })
  it('is muted until pressed or hovered', () => {
    expect(declarations(css, '.sortable-handle')['color']).toBe('var(--color-muted)')
    expect(declarations(css, ".sortable-handle[aria-pressed='true']")['color']).toBe('var(--color-text)')
  })
})

describe('the item states', () => {
  it('a lifted item (keyboard) is outlined with the accent', () => {
    expect(declarations(css, ".sortable__item[data-state='lifted']")['outline']).toMatch(/var\(--color-accent\)/)
  })
  it('a dragged item floats above its neighbours, follows --sortable-dy and has the popover elevation', () => {
    const d = declarations(css, ".sortable__item[data-state='dragging']")
    expect(d['position']).toBe('relative')
    expect(Number(d['z-index'])).toBeGreaterThanOrEqual(1)
    expect(d['transform']).toMatch(/translateY\(var\(--sortable-dy/)
    expect(d['box-shadow']).toBe('var(--elev-2)')
    expect(d['cursor']).toBe('grabbing')
  })
  it('the dragged item does not animate its own transform (it tracks the finger); the others have no dead transition (the preview reorders the DOM)', () => {
    expect(declarations(css, ".sortable__item[data-state='dragging']")['transition']).toBe('none')
    expect(declarations(css, '.sortable__item')['transition']).toBeUndefined()
  })
})

describe('the hidden helpers', () => {
  for (const sel of ['.sortable__live', '.sortable__instructions']) {
    it(`${sel} is visually hidden but stays in the accessibility tree`, () => {
      const d = declarations(css, sel)
      expect(d['position']).toBe('absolute')
      expect(d['clip-path']).toBe('inset(50%)')
      expect(d['inline-size']).toBe('1px')
      expect(d['display']).not.toBe('none')
    })
  }
})
