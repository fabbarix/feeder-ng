// B9-41 (SSP-07): the Price keypad of a weighed row. The keys are 8 px apart, so a focused key draws its ring INSIDE itself (R-C+: 2 px accent at
// -2 px offset on a soft fill) and never overlaps its neighbour; the notes under the display stack ("× 312 g = $4.65", then "No Price at Coop yet").
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('PriceKeypad.css')

describe('PriceKeypad.css: the focused key', () => {
  const ring = () => declarations(css, '.price-keypad__key:focus-visible')

  it('draws a 2 px accent ring inside the key: a negative offset of at least the width', () => {
    const d = ring()
    // batch w5a: written in the focus tokens (ui/focusLayer.css.test.ts forbids literal px and accent in a focus outline); in
    // styles.css --focus-ring-inner-width is 2px and --focus-ring-color is var(--color-accent), so this is 2 px accent at -2 px.
    expect(d['outline']).toMatch(/^var\(--focus-ring-inner-width\) solid var\(--focus-ring-color\)$/)
    expect(d['outline-offset']).toMatch(/^calc\(-1 \* var\(--focus-ring-inner-width\)\)$/)
  })

  it('on a soft fill, so the ring is 3:1 against the key (3.4:1 light, 3.6:1 dark)', () => {
    expect(ring()['background']).toBe('var(--color-soft)')
  })

  it('the key is not given a second ring: no box-shadow ring and no outside offset', () => {
    const d = ring()
    expect(d['box-shadow'] ?? 'none').toBe('none')
    expect(css).not.toMatch(/\.price-keypad__key:focus-visible[^{]*\{[^}]*outline-offset:\s*[1-9]/)
  })
})

describe('PriceKeypad.css: the notes stack', () => {
  it('the compact keypad puts the notes one under the other, centred, not side by side', () => {
    const d = declarations(css, ".price-keypad[data-compact='true'] .price-keypad__notes")
    expect(d['display']).toMatch(/^(grid|flex)$/)
    if (d['display'] === 'flex') expect(d['flex-direction']).toBe('column')
    expect(d['flex-wrap'] ?? 'nowrap').not.toBe('wrap')
    expect(d['justify-items'] ?? d['align-items']).toBe('center')
    expect(d['gap']).toMatch(/^var\(--space-\d+\)$/)
  })
})
