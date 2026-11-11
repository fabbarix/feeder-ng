// XS: the Select and DateField popovers must not be absolutely positioned inside their field (a dialog's overflow
// clips that). They are fixed, in the top layer, placed by script.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

describe.each([
  ['Select/Select.css', '.select__popover'],
  ['fields/DateField.css', '.date-field__popover'],
])('%s %s', (file, selector) => {
  const css = readUiCss(file)
  const d = declarations(css, selector)
  it('is position: fixed, not absolute', () => {
    expect(d['position']).toBe('fixed')
    const block = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
    expect(block).not.toMatch(/position:\s*absolute/)
  })
  it('resets the UA [popover] box: no auto margin, no inset, nothing clipped by the box itself', () => {
    expect(d['margin']).toBe('0')
    expect(d['inset']).toBe('auto')
    expect(d['overflow']).toBe('visible')
  })
  it('keeps the surface look', () => {
    expect(d['background']).toBe('var(--color-surface)')
    expect(d['box-shadow']).toBe('var(--elev-2)')
  })
})
