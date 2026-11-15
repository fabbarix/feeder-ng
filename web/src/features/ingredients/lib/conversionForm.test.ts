import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import { checkConversion, conversionErrors, parseShelfLife } from './conversionForm'

describe('checkConversion', () => {
  it('accepts a unit and amount, cleaning the unit', () => {
    expect(checkConversion('  Clove ', '5', 'g', [])).toEqual({ ok: true, value: { unit: 'clove', toBase: 5 } })
  })
  it('accepts a decimal comma', () => {
    expect(checkConversion('slice', '12,5', 'g', [])).toEqual({ ok: true, value: { unit: 'slice', toBase: 12.5 } })
  })
  it('rejects an empty unit', () => {
    expect(checkConversion('  ', '5', 'g', [])).toEqual({ ok: false, error: strings.errors.unitRequired })
  })
  it('rejects the Base Unit itself, ignoring case', () => {
    expect(checkConversion('ML', '1', 'ml', [])).toEqual({ ok: false, error: strings.errors.unitIsBase('ml') })
  })
  it('rejects a unit the Ingredient already converts', () => {
    expect(checkConversion('Clove', '5', 'g', ['clove'])).toEqual({ ok: false, error: strings.errors.unitTaken })
  })
  it.each(['', 'abc', '0', '-3', 'Infinity', 'NaN', '1e999'])('rejects the amount %j', (amount) => {
    expect(checkConversion('clove', amount, 'g', [])).toEqual({ ok: false, error: strings.errors.amountInvalid })
  })
})

// B9-48 (SAFE-04): every problem of the add form, each against its own field, so the form can mark both and focus the first.
// conversionErrors(unit, amount, base, existingUnits): { unit?: string; amount?: string } ({} = valid; same words as checkConversion).
describe('conversionErrors: by field', () => {
  it('is empty for a valid pair', () => {
    expect(conversionErrors('bulb', '50', 'g', ['clove'])).toEqual({})
  })
  it('a blank unit is the Unit field\'s, worded with an example (SAFE-04 copy table)', () => {
    expect(conversionErrors('  ', '5', 'g', [])).toEqual({ unit: 'Enter a unit, for example clove.' })
  })
  it('the Base Unit itself and a unit already converted are Unit errors', () => {
    expect(conversionErrors('G', '5', 'g', [])).toEqual({ unit: strings.errors.unitIsBase('g') })
    expect(conversionErrors('Clove', '5', 'g', ['clove'])).toEqual({ unit: strings.errors.unitTaken })
  })
  it('a bad amount is the Amount field\'s', () => {
    expect(conversionErrors('bulb', '0', 'g', [])).toEqual({ amount: strings.errors.amountInvalid })
  })
  it('both wrong: both reported', () => {
    expect(conversionErrors('', 'x', 'g', [])).toEqual({ unit: 'Enter a unit, for example clove.', amount: strings.errors.amountInvalid })
  })
  it('checkConversion keeps its first-error words, and its unit-required message is the same sentence', () => {
    expect(checkConversion('  ', '5', 'g', [])).toEqual({ ok: false, error: 'Enter a unit, for example clove.' })
  })
})

describe('parseShelfLife', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['7', 7],
    [' 30 ', 30],
    ['1', 1],
    ['0', undefined],
    ['-2', undefined],
    ['2.5', undefined],
    ['abc', undefined],
    ['4000000', undefined],
  ])('%j -> %j', (text, result) => expect(parseShelfLife(text)).toBe(result))
})
