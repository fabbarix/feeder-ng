import { describe, expect, it } from 'vitest'
import { formatMajor, formatMinor, formatPricePerKg, fractionDigits, parseMajor } from './money'

describe('fractionDigits', () => {
  it('knows the minor unit of a currency', () => {
    expect(fractionDigits('USD')).toBe(2)
    expect(fractionDigits('EUR')).toBe(2)
    expect(fractionDigits('JPY')).toBe(0)
  })
})

describe('formatMinor', () => {
  it('formats cents as money', () => {
    expect(formatMinor(159, 'USD', 'en-US')).toBe('$1.59')
    expect(formatMinor(100000, 'USD', 'en-US')).toBe('$1,000.00')
    expect(formatMinor(5, 'USD', 'en-US')).toBe('$0.05')
  })
  it('respects a currency without minor units', () => {
    expect(formatMinor(159, 'JPY', 'en-US')).toBe('¥159')
  })
})

describe('formatMajor', () => {
  it('writes the editable amount', () => {
    expect(formatMajor(159, 'USD')).toBe('1.59')
    expect(formatMajor(200, 'USD')).toBe('2.00')
    expect(formatMajor(5, 'USD')).toBe('0.05')
    expect(formatMajor(159, 'JPY')).toBe('159')
  })
})

describe('parseMajor', () => {
  it.each([
    ['1.59', 'USD', 159],
    ['1,59', 'USD', 159],
    ['19.99', 'USD', 1999], // 19.99 * 100 is 1998.9999999999998 in floating point
    ['2', 'USD', 200],
    ['1.5', 'USD', 150],
    ['  12  ', 'USD', 1200],
    ['0.05', 'USD', 5],
    ['.5', 'USD', 50],
    ['0', 'USD', 0],
    ['159', 'JPY', 159],
  ])('%s %s -> %s', (text, cur, want) => {
    expect(parseMajor(text, cur)).toBe(want)
  })

  it.each([
    ['', 'USD'],
    ['abc', 'USD'],
    ['-1.00', 'USD'],
    ['1.599', 'USD'],
    ['1.2.3', 'USD'],
    ['159.5', 'JPY'],
    ['$1.59', 'USD'],
  ])('%j %s is not an amount', (text, cur) => {
    expect(parseMajor(text, cur)).toBeNull()
  })
})

describe('formatPricePerKg', () => {
  it('adds the unit', () => {
    expect(formatPricePerKg(227, 'USD', 'en-US')).toBe('$2.27 / kg')
  })
})
