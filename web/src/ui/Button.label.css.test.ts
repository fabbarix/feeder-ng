// SF1 defect 2: "Merge into another Ingredient" (a tertiary Button in a half-width Tile) spilled out of its Tile on the left.
// Cause: .button is white-space: nowrap, justify-content: center and a fixed block-size, so a label wider than the Tile overflows both sides.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('Button.css')

describe('Button.css, a long label stays inside its container (SF1)', () => {
  it('never exceeds its container: max-inline-size 100%', () => {
    expect(declarations(css, '.button')['max-inline-size']).toBe('100%')
  })

  it('the label may wrap between words: no white-space: nowrap on .button', () => {
    expect(declarations(css, '.button')['white-space'] ?? 'normal').not.toBe('nowrap')
  })

  it('a wrapped label is centred and wraps at word boundaries only (DS-A system.md §1, §10: no break-word)', () => {
    const d = declarations(css, '.button')
    expect(d['text-align']).toBe('center')
    expect(d['overflow-wrap'] ?? 'normal').toBe('normal')
    expect(d['word-break'] ?? 'normal').toBe('normal')
    expect(d['hyphens'] ?? 'manual').toBe('manual')
  })

  it.each(['sm', 'md', 'lg', 'xl'])('size %s grows with two lines: min-block-size', (size) => {
    expect(declarations(css, `.button[data-size='${size}']`)['min-block-size']).toMatch(/^\d+px$/)
  })

  it('a one-line Button keeps its exact height and does not stretch', () => {
    expect(declarations(css, '.button')['block-size']).toBe('fit-content')
  })

  it.each(['sm', 'md', 'lg', 'xl'])('size %s sets no fixed block-size', (size) => {
    expect(declarations(css, `.button[data-size='${size}']`)['block-size']).toBeUndefined()
  })

  it('line-height is no longer 1 (two lines must not touch)', () => {
    const lh = declarations(css, '.button')['line-height']
    expect(lh).toBeDefined()
    expect(lh).not.toBe('1')
  })
})
