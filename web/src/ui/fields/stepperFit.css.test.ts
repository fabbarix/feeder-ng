// XS: at full width the Quantity stepper overflowed its control by ~2px, putting a horizontal scrollbar in the sheet body.
// The stepper's flex children (value input, buttons) must be allowed to shrink inside the control, and the control inside its field.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'

const field = readUiCss('fields/Field.css')
const zero = (v: string | undefined) => v === '0' || v === '0px'

describe('stepper fits its full-width field', () => {
  it('the stepper control can shrink below its content (min-inline-size: 0)', () => {
    expect(zero(declarations(field, '.ui-field--stepper .ui-field__control')['min-inline-size'])).toBe(true)
  })

  it('the stepper value input shrinks with the control: flex-shrink allowed and no min wider than 3ch', () => {
    const input = declarations(field, '.ui-field--stepper .ui-field__input')
    const min = input['min-inline-size']
    expect(min === undefined || zero(min) || Number(min.replace('ch', '')) <= 3).toBe(true)
    expect(input['flex-shrink']).not.toBe('0')
  })

  it('the stepper field stays shrinkable inside a grid/flex parent', () => {
    expect(zero(declarations(field, '.ui-field')['min-inline-size'])).toBe(true)
  })

  it('borders are counted inside the control width (border-box)', () => {
    const own = declarations(field, '.ui-field--stepper .ui-field__control')['box-sizing'] ?? declarations(field, '.ui-field__control')['box-sizing']
    expect(own === undefined || own === 'border-box').toBe(true)
  })
})
