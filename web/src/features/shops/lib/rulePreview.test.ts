import { describe, expect, it } from 'vitest'
import type { WeightRule } from '../../scan/lib/barcode'
import { strings } from '../strings'
import { decodeSample, previewText } from './rulePreview'

const g21: WeightRule = { id: 0, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'g', decimalPlaces: 0 }
const kg21: WeightRule = { ...g21, valueUnit: 'kg', decimalPlaces: 3 }
const price22: WeightRule = { id: 0, prefix: '22', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'price', decimalPlaces: 0 }
// US variable-weight UPC-A: the rule addresses the 13-digit form, so prefix 02 and positions shifted by one.
const usLb: WeightRule = { id: 0, prefix: '02', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'lb', decimalPlaces: 2 }

describe('decodeSample', () => {
  it('is idle for a blank sample', () => {
    expect(decodeSample(g21, '')).toEqual({ state: 'idle' })
    expect(decodeSample(g21, '   ')).toEqual({ state: 'idle' })
  })
  it('reads a weight in grams', () => {
    expect(decodeSample(g21, '2100123007509')).toEqual({ state: 'ok', itemCode: '00123', weightGrams: 750 })
  })
  it('reads the same digits in kg with three decimal places: 0.750 kg is 750 g', () => {
    expect(decodeSample(kg21, '2100123007509')).toEqual({ state: 'ok', itemCode: '00123', weightGrams: 750 })
  })
  it('reads a price in minor units', () => {
    expect(decodeSample(price22, '2200123004505')).toEqual({ state: 'ok', itemCode: '00123', priceCents: 450 })
  })
  it('reads a US pound label: 1.50 lb is 680.389 g', () => {
    expect(decodeSample(usLb, '0212345001509')).toEqual({ state: 'ok', itemCode: '12345', weightGrams: 680.389 })
  })
  it('accepts the 12-digit UPC-A as printed', () => {
    expect(decodeSample(usLb, '212345001509')).toEqual({ state: 'ok', itemCode: '12345', weightGrams: 680.389 })
  })
  it('says when the prefix does not match', () => {
    expect(decodeSample(g21, '2200123004505')).toEqual({ state: 'nomatch' })
    expect(decodeSample(g21, '5901234123457')).toEqual({ state: 'nomatch' })
  })
  it('says why a sample is unreadable', () => {
    expect(decodeSample(g21, '2100123007500')).toEqual({ state: 'invalid', reason: 'check_digit' })
    expect(decodeSample(g21, '21001')).toEqual({ state: 'invalid', reason: 'length' })
    expect(decodeSample(g21, '21x0123007509')).toEqual({ state: 'invalid', reason: 'format' })
  })
  it('flags a zero value', () => {
    expect(decodeSample(price22, '2200123000002')).toEqual({ state: 'invalid', reason: 'zero_value' })
  })
  it('does not decode with a rule that is not valid yet', () => {
    expect(decodeSample({ ...g21, value: { start: 6, length: 5 } }, '2100123007509')).toEqual({ state: 'nomatch' })
    expect(decodeSample({ ...g21, prefix: '' }, '2100123007509')).toEqual({ state: 'nomatch' })
  })
})

describe('previewText', () => {
  it('shows item and weight', () => {
    expect(previewText({ state: 'ok', itemCode: '00123', weightGrams: 750 }, 'USD')).toBe('Item 00123 · 750 g')
    expect(previewText({ state: 'ok', itemCode: '12345', weightGrams: 680.389 }, 'USD')).toBe('Item 12345 · 680.389 g')
  })
  it("shows the weight in the rule's unit, then in grams: 0.5 kg (500 g)", () => {
    expect(previewText({ state: 'ok', itemCode: '00123', weightGrams: 500 }, 'USD', 'kg')).toBe('Item 00123 · 0.5 kg (500 g)')
    expect(previewText({ state: 'ok', itemCode: '00123', weightGrams: 750 }, 'USD', 'kg')).toBe('Item 00123 · 0.75 kg (750 g)')
    expect(previewText({ state: 'ok', itemCode: '12345', weightGrams: 680.389 }, 'USD', 'lb')).toBe('Item 12345 · 1.5 lb (680.389 g)')
  })
  it('shows grams alone when the rule is in grams', () => {
    expect(previewText({ state: 'ok', itemCode: '00123', weightGrams: 750 }, 'USD', 'g')).toBe('Item 00123 · 750 g')
  })
  it('shows item and price in the Household currency', () => {
    expect(previewText({ state: 'ok', itemCode: '00123', priceCents: 450 }, 'USD')).toBe('Item 00123 · $4.50')
  })
  it('uses the messages for the other states', () => {
    expect(previewText({ state: 'idle' }, 'USD')).toBe(strings.previewIdle)
    expect(previewText({ state: 'nomatch' }, 'USD')).toBe(strings.previewNoMatch)
    expect(previewText({ state: 'invalid', reason: 'check_digit' }, 'USD')).toBe(strings.previewInvalid.check_digit)
    expect(previewText({ state: 'invalid', reason: 'zero_value' }, 'USD')).toBe(strings.previewInvalid.zero_value)
  })
})
