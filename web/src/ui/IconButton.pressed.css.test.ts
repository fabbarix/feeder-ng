// A11Y-06 (decision 2): a pressed toggle IconButton is the accent container (--selected-bg / --selected-fg) with a ring inside the edge
// (--selected-ring), and a filled glyph (the second, non-colour cue: IconButton.test.tsx pins the fill weight). Hover and active keep the ring.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss, ruleBlocks } from './test-utils'

const css = readUiCss('IconButton.css')
const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ')

describe("IconButton.css [aria-pressed='true']", () => {
  const d = () => declarations(css, ".icon-button[aria-pressed='true']")

  it('is the accent container with the selected ring inside the edge', () => {
    expect(d()['background']).toBe('var(--selected-bg)')
    expect(d()['color']).toBe('var(--selected-fg)')
    expect(d()['box-shadow']).toBe('inset 0 0 0 var(--selected-ring-width) var(--selected-ring)')
  })

  it('keeps the ring under hover and active (a layered fill, never a replaced ring)', () => {
    for (const state of [':hover:not(:disabled)', ':active:not(:disabled)']) {
      const bodies = ruleBlocks(css)
        .filter((r) => r.selectors.some((s) => norm(s) === `.icon-button[aria-pressed='true']${state}`))
        .map((r) => norm(r.body))
        .join(' ')
      expect(bodies, state).toMatch(/inset 0 0 0 var\(--selected-ring-width\) var\(--selected-ring\),\s*inset 0 0 0 999px/)
    }
  })

  it('on a soft or status tile the pressed ring still wins over the tile boundary', () => {
    const rules = ruleBlocks(css).filter((r) => r.selectors.some((s) => /\.tile\[data-variant='(soft|status)'\] \.icon-button\[aria-pressed='true'\]/.test(norm(s))))
    expect(rules.length).toBeGreaterThan(0)
    expect(norm(rules.map((r) => r.body).join(' '))).toContain('var(--selected-ring)')
  })
})

describe('IconButton.css nested in the stepper field (A11Y-09)', () => {
  const field = readUiCss('fields/Field.css')
  it('the buttons are 36 px with a 44 px hit area, so 4.5 px of fill is left inside the 48 px frame', () => {
    expect(declarations(field, '.ui-field--stepper .icon-button')).toMatchObject({ 'inline-size': '36px', 'block-size': '36px' })
    expect(declarations(field, '.ui-field--stepper .icon-button::after')['inset']).toBe('-4px')
  })
})
