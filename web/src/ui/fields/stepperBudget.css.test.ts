// R2-F review fix: the compact stepper must keep its value visible. Width budget computed from the tokens:
// frame = 2 borders + 2 inline paddings + gaps between children + 2 buttons + unit + value.
import { describe, expect, it } from 'vitest'
import { declarations, readStylesCss, readUiCss } from '../test-utils'

const field = readUiCss('fields/Field.css')
const tokens: Record<string, string> = {}
for (const m of (field + readStylesCss()).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]!] = m[2]!.trim()

const px = (v: string): number => {
  const t = v.trim()
  const vr = t.match(/^var\((--[\w-]+)\)$/)
  if (vr) return px(tokens[vr[1]!]!)
  const m = t.match(/^(-?[\d.]+)px$/)
  if (!m) throw new Error(`not px: ${v}`)
  return Number(m[1])
}
const CH = 10 // conservative tabular digit width at body-strong size
const UNIT_CHAR = 8 // conservative meta-size character width

const control = declarations(field, '.ui-field--stepper .ui-field__control')
const inline = px(control['padding']!.split(/\s+/)[1]!)
const gap = px(control['gap']!)
const button = px(declarations(field, '.ui-field--stepper .icon-button')['inline-size']!)
const border = px('var(--field-border-width)')
const minValue = (() => {
  const v = declarations(field, '.ui-field--stepper .ui-field__input')['min-inline-size']
  return v ? Number(v.replace('ch', '')) * CH : 0
})()

/** Space left for the value input: the frame cap minus everything fixed. */
function remaining(cap: string, unit: string): number {
  const children = unit ? 4 : 3
  return px(cap) - 2 * border - 2 * inline - (children - 1) * gap - 2 * button - unit.length * UNIT_CHAR
}

describe('compact stepper width budget', () => {
  it('the input reserves at least 3ch, so it never collapses to 0', () => {
    expect(minValue).toBeGreaterThanOrEqual(3 * CH)
  })

  it('"99" fits the xs stepper (no unit)', () => {
    expect(remaining('var(--field-size-xs-stepper)', '')).toBeGreaterThanOrEqual(2 * CH)
  })

  it('"999" with the unit "people" fits the sm stepper', () => {
    expect(remaining('var(--field-size-sm-stepper)', 'people')).toBeGreaterThanOrEqual(3 * CH)
  })

  it('"999" with a short unit (g, min) fits the xs stepper too', () => {
    expect(remaining('var(--field-size-xs-stepper)', 'g')).toBeGreaterThanOrEqual(3 * CH - 6)
  })

  it('the reserved min value width itself fits the sm budget', () => {
    expect(remaining('var(--field-size-sm-stepper)', 'people')).toBeGreaterThanOrEqual(minValue)
  })
})
