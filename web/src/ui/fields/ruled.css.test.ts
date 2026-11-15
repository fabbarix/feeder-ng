// A11Y-05 (decision 1, option B): the Search field and the Segmented track are RULED (a stronger fill and a 2 px bottom rule), next
// to the FRAMED fields (a 1.5 px outline all round). Flat-CSS reads; jsdom has no layout. Contrast is in ruled.contrast.test.ts.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'

const field = readUiCss('fields/Field.css')
const search = readUiCss('fields/SearchField.css') + field
const segmented = readUiCss('fields/Segmented.css') + field
const dateField = readUiCss('fields/DateField.css')
const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ')

describe('the ruled tokens', () => {
  it('sit in Field.css :root next to --field-border-width', () => {
    const root = declarations(field, ':root')
    expect(root['--field-fill-strong']).toBe('var(--color-surface-3)')
    expect(root['--field-rule-width']).toBe('2px')
    expect(root['--field-rule-color']).toBe('var(--color-outline)')
    expect(root['--field-radius-ruled']).toBe('var(--radius-control) var(--radius-control) var(--space-1) var(--space-1)')
    expect(root['--field-border-width']).toBe('1.5px')
  })
})

describe.each([
  ['SearchField control', '.search-field__control', search],
  ['Segmented track', '.segmented', segmented],
] as const)('%s at rest', (_name, selector, css) => {
  it('has the strong fill, no frame and a 2 px bottom rule with a ruled radius', () => {
    const d = declarations(css, selector)
    expect(d['background']).toBe('var(--field-fill-strong)')
    expect(d['border']).toBe('0')
    expect(d['border-block-end']).toBe('var(--field-rule-width) solid var(--field-rule-color)')
    expect(d['border-radius']).toBe('var(--field-radius-ruled)')
  })

  it('is not the surface-2 fill any more (it was 1.09:1 on the page)', () => {
    expect(declarations(css, selector)['background']).not.toBe('var(--color-surface-2)')
  })
})

describe('hover', () => {
  it('the fill darkens by 6 % toward the text colour', () => {
    expect(declarations(search, '.search-field__control:hover')['background']).toBe('color-mix(in oklab, var(--field-fill-strong), var(--color-text) 6%)')
    expect(declarations(segmented, '.segmented:not([data-disabled]):hover')['background']).toBe('color-mix(in oklab, var(--field-fill-strong), var(--color-text) 6%)')
  })
})

describe('focus', () => {
  it('the Search frame rings only while its input has focus, and the rule turns accent', () => {
    const d = declarations(search, '.search-field__control:has(input:focus)')
    expect(d['border-block-end-color']).toBe('var(--color-accent)')
    expect(d['outline']).toBe('var(--focus-ring-width) solid var(--focus-ring-color)')
    expect(d['outline-offset']).toBe('0')
    expect(norm(search)).not.toMatch(/\.search-field__control:focus-within/)
  })
})

describe('disabled', () => {
  it.each([
    ['.segmented[data-disabled]', segmented],
    ['.search-field__control:has(:disabled)', search],
  ] as const)('%s has no fill and a --color-line rule, in muted text', (selector, css) => {
    const d = declarations(css, selector)
    expect(d['background']).toBe('transparent')
    expect(d['border']).toBe('0')
    expect(d['border-block-end']).toBe('var(--field-rule-width) solid var(--color-line)')
    expect(d['color']).toBe('var(--color-muted)')
  })

  it('the selected option of a disabled Segmented keeps its 1.5 px outline ring and no fill', () => {
    const d = declarations(segmented, ".segmented[data-disabled] .segmented__option[aria-checked='true']")
    expect(d['background']).toBe('transparent')
    expect(d['color']).toBe('var(--color-text)')
    expect(d['box-shadow']).toBe('inset 0 0 0 var(--field-border-width) var(--color-outline)')
  })
})

describe('sizes', () => {
  it('both stay 48 px high', () => {
    expect(declarations(search, '.search-field__control')['min-block-size']).toBe('48px')
    expect(norm(segmented)).toMatch(/\.segmented__option\s*\{[^}]*min-block-size:\s*(40px)/) // 40 + 2 x 4 padding = 48
  })
})

describe('the framed fields keep their 1.5 px outline', () => {
  it('TextField, TextArea, Select frame, stepper field and TimeField', () => {
    const d = declarations(field, '.ui-field__control')
    expect(d['border']).toBe('var(--field-border-width) solid var(--color-outline)')
    expect(d['background']).toBe('var(--color-surface-2)')
  })
  it('DateField trigger', () => {
    expect(declarations(dateField, '.date-field__trigger')['border']).toBe('var(--field-border-width) solid var(--color-outline)')
  })
})
