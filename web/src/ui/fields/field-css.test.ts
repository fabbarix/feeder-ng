// CSS contracts of the field primitives' sizing (read as text; jsdom has no layout). U1: iPad Safari clipped TimeField digits
// ("19" -> "1"), drew a circular focus ring, and indented TextField text more than the Select value.
import { describe, expect, it } from 'vitest'
import { declarations, readStylesCss, readUiCss } from '../test-utils'

const time = readUiCss('fields/TimeField.css')
const field = readUiCss('fields/Field.css')
const select = readUiCss('Select/Select.css')
const styles = readStylesCss()

const segment = () => declarations(time, '.time-field__segment')
const chValue = (v: string | undefined) => {
  const m = v?.match(/^(\d+(?:\.\d+)?)ch$/)
  return m ? Number(m[1]) : null
}

describe('TimeField.css segment inputs', () => {
  it('drop the native WebKit look and intrinsic padding', () => {
    const s = segment()
    expect(s['-webkit-appearance']).toBe('none')
    expect(s['appearance']).toBe('none')
    expect(s['padding']).toBe('0')
  })

  it('use tabular numerals', () => {
    const s = segment()
    const group = declarations(time, '.time-field')
    expect(s['font-variant-numeric'] ?? group['font-variant-numeric']).toBe('tabular-nums')
  })

  it('have a min-inline-size that fits two Figtree 800 digits (at least 3ch, or an em/rem/px equivalent)', () => {
    const min = segment()['min-inline-size']
    expect(min, 'min-inline-size is set').toBeTruthy()
    const ch = chValue(min)
    if (ch !== null) expect(ch).toBeGreaterThanOrEqual(3)
    else expect(min).toMatch(/^(\d+(\.\d+)?em|calc\(|var\(|\d+px)/)
  })

  it('never fix the width in ch below that (border-box padding used to eat 8px of 2.2ch)', () => {
    const ch = chValue(segment()['inline-size'])
    if (ch !== null) expect(ch).toBeGreaterThanOrEqual(3)
    expect(segment()['inline-size'] ?? '').not.toMatch(/^2(\.\d+)?ch$/)
  })

  it('focus ring is a rounded rectangle, never a circle or pill that clips the digits', () => {
    const base = segment()['border-radius'] ?? ''
    const focus = declarations(time, '.time-field__segment:focus-visible')['border-radius'] ?? base
    for (const r of [base, focus]) {
      expect(r).not.toMatch(/50%|999|radius-chip/)
      expect(r).toMatch(/^(var\(--radius-(control|sm|segment)[a-z-]*\)|\d+px)$/)
    }
    expect(focus).toBeTruthy()
  })
})

describe('shared inner padding token', () => {
  it('--field-pad-inline is defined once in Field.css or styles.css', () => {
    expect(field + styles).toMatch(/--field-pad-inline\s*:\s*[^;]+;/)
  })

  it('TextField control, Select trigger and TimeField group all pad inline with it', () => {
    for (const [css, sel] of [
      [field, '.ui-field__control'],
      [select, '.select__trigger'],
      [time, '.time-field'],
    ] as const) {
      const d = declarations(css, sel)
      expect(`${d['padding'] ?? ''} ${d['padding-inline'] ?? ''}`, sel).toContain('var(--field-pad-inline)')
    }
  })

  it('the text inside adds no extra inline padding (native input padding reset, Select value has none)', () => {
    const input = declarations(field, '.ui-field__input')
    expect(input['padding']).toBe('0')
    expect(input['-webkit-appearance']).toBe('none')
    const value = declarations(select, '.select__value')
    expect(value['padding'] ?? '0').toBe('0')
  })
})
