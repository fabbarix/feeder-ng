// w6a (B9-46 follow-up): a disabled field looks disabled in every shared field, not only with paler text: no fill, a faint outline.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')
const block = (css: string, selector: string) => {
  const i = css.indexOf(`${selector} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}

describe('disabled field controls share one muted look', () => {
  const field = read('./Field.css')
  it('the tokens: no fill and a faint outline', () => {
    expect(field).toMatch(/--field-disabled-bg:\s*transparent/)
    expect(field).toMatch(/--field-disabled-border:\s*color-mix\(in srgb, var\(--color-outline\) 40%, transparent\)/)
  })
  it.each([
    ['Field', field, ".ui-field__control:has(:is(input, textarea, [role='spinbutton']):disabled)"],
    ['TimeField', read('./TimeField.css'), '.time-field[data-disabled]'],
    ['DateField', read('./DateField.css'), '.date-field__trigger:disabled'],
    ['Select', read('../Select/Select.css'), '.select__trigger:disabled'],
  ])('%s uses them, with muted text', (_n, css, selector) => {
    const b = block(css, selector)
    expect(b).toMatch(/background:\s*var\(--field-disabled-bg\)/)
    expect(b).toMatch(/border-color:\s*var\(--field-disabled-border\)/)
    expect(b).toMatch(/color:\s*var\(--color-muted\)/)
  })
  it('a stepper at its minimum (only its − button disabled) keeps the field look', () => {
    expect(field).not.toMatch(/\.ui-field__control:has\(:disabled\)\s*\{[^}]*--field-disabled/)
  })
  it('the label of a disabled DateField or Select is muted too', () => {
    expect(field).toMatch(/\.ui-field:has\(\.date-field__trigger:disabled\) \.ui-field__label/)
    expect(field).toMatch(/\.ui-field:has\(\.select__trigger:disabled\) \.ui-field__label/)
  })
})
