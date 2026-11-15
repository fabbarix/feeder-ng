// B9-41 (SSP-20, SSP-15): the code as printed under the bars, and the GS1 in-store prefix. Pure.
import { describe, expect, it } from 'vitest'
import { displayCode, isInStoreCode } from './barcode'

describe('displayCode (SSP-20): the code as printed, never the 14 digits nobody typed', () => {
  it.each([
    // EAN-13 in 1-6-6 groups: the canonical GTIN-14 of 8000000009999 and the code as typed read the same
    ['08000000009999', '8 000000 009999'],
    ['8000000009999', '8 000000 009999'],
    ['02100123012503', '2 100123 012503'],
    ['04006381333931', '4 006381 333931'],
    // UPC-A in 1-5-5-1 (an EAN-13 with a leading 0 is a UPC-A)
    ['00036000291452', '0 36000 29145 2'],
    ['036000291452', '0 36000 29145 2'],
    // EAN-8 in 4-4
    ['00000096385074', '9638 5074'],
    ['96385074', '9638 5074'],
  ])('%s is printed %s', (code, printed) => {
    expect(displayCode(code)).toBe(printed)
  })

  it('anything else is shown as typed: a GTIN-14 with an indicator digit, a Code 128 string, an empty string', () => {
    expect(displayCode('12345678901231')).toBe('12345678901231')
    expect(displayCode('ABC-123')).toBe('ABC-123')
    expect(displayCode('')).toBe('')
  })

  it('never shows a leading pad of zeros for a code of 13 or fewer digits', () => {
    for (const code of ['08000000009999', '00036000291452', '00000096385074']) expect(displayCode(code)).not.toMatch(/^0{2,}/)
  })
})

describe('isInStoreCode (SSP-15): an EAN-13 with a GS1 in-store prefix, 20 to 29 or 02', () => {
  it.each(['2000123003122', '2100123012503', '2900000000009', '0200000012345'])('%s is an in-store code', (code) => {
    expect(isInStoreCode(code)).toBe(true)
  })

  it('its GTIN-14 (a leading 0) reads the same', () => {
    expect(isInStoreCode('02100123012503')).toBe(true)
    expect(isInStoreCode('00200000012345')).toBe(true)
  })

  it.each(['8000500310427', '3017620422003', '1999999999999', '3000000000000', '0123456789012', '0100000000009'])('%s is an ordinary code', (code) => {
    expect(isInStoreCode(code)).toBe(false)
  })

  it('a GTIN-14 with an indicator digit, an EAN-8, a UPC-A and a string that is not digits are never in-store codes', () => {
    expect(isInStoreCode('22100123012503')).toBe(false)
    expect(isInStoreCode('21001230')).toBe(false)
    expect(isInStoreCode('210012301250')).toBe(false)
    expect(isInStoreCode('ABC-123')).toBe(false)
    expect(isInStoreCode('')).toBe(false)
  })
})
