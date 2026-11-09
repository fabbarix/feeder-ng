import { describe, expect, it } from 'vitest'
import { parseAmount } from './amount'

describe('parseAmount', () => {
  it('parses plain and decimal-comma numbers', () => {
    expect(parseAmount('300', 'positive')).toEqual({ ok: true, value: 300 })
    expect(parseAmount(' 1,5 ', 'positive')).toEqual({ ok: true, value: 1.5 })
    expect(parseAmount('0.25', 'nonNegative')).toEqual({ ok: true, value: 0.25 })
  })
  it('accepts zero only for nonNegative', () => {
    expect(parseAmount('0', 'nonNegative')).toEqual({ ok: true, value: 0 })
    expect(parseAmount('0', 'positive')).toEqual({ ok: false, error: 'notPositive' })
  })
  it('rejects negatives, empties and junk', () => {
    expect(parseAmount('-5', 'nonNegative')).toEqual({ ok: false, error: 'negative' })
    expect(parseAmount('-5', 'positive')).toEqual({ ok: false, error: 'negative' })
    expect(parseAmount('', 'positive')).toEqual({ ok: false, error: 'empty' })
    expect(parseAmount('   ', 'nonNegative')).toEqual({ ok: false, error: 'empty' })
    expect(parseAmount('abc', 'positive')).toEqual({ ok: false, error: 'invalid' })
    expect(parseAmount('1e400', 'positive')).toEqual({ ok: false, error: 'invalid' })
    expect(parseAmount('12 g', 'positive')).toEqual({ ok: false, error: 'invalid' })
  })
})
