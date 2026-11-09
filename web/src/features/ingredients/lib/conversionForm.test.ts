import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import { checkConversion, parseShelfLife } from './conversionForm'

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
