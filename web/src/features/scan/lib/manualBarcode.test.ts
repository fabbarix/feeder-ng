import { describe, expect, it } from 'vitest'
import { validateManualBarcode } from './manualBarcode'

describe('validateManualBarcode', () => {
  it('accepts an EAN-13 and returns the parsed GTIN-14', () => {
    const r = validateManualBarcode('8000500310427')
    expect(r).toMatchObject({ ok: true, scanned: { kind: 'gtin', code: '08000500310427', ean13: '8000500310427' } })
  })

  it('accepts EAN-8, UPC-A and GTIN-14', () => {
    expect(validateManualBarcode('96385074')).toMatchObject({ ok: true, scanned: { code: '00000096385074' } })
    expect(validateManualBarcode('036000291452')).toMatchObject({ ok: true, scanned: { code: '00036000291452' } })
    expect(validateManualBarcode('08000500310427')).toMatchObject({ ok: true })
  })

  it('ignores surrounding spaces and the spaces or hyphens people type between digit groups', () => {
    for (const typed of [' 8000500310427 ', '8000 5003 10427', '8-000500-310427']) {
      expect(validateManualBarcode(typed)).toMatchObject({ ok: true, scanned: { code: '08000500310427' } })
    }
  })

  it('refuses nothing typed', () => {
    expect(validateManualBarcode('')).toEqual({ ok: false, reason: 'empty' })
    expect(validateManualBarcode('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('refuses a wrong number of digits', () => {
    expect(validateManualBarcode('123')).toEqual({ ok: false, reason: 'length' })
    expect(validateManualBarcode('80005003104271')).toMatchObject({ ok: false }) // 14 digits, bad check digit
    expect(validateManualBarcode('800050031042712345')).toEqual({ ok: false, reason: 'length' })
  })

  it('refuses letters and other symbols', () => {
    expect(validateManualBarcode('800050031042x')).toEqual({ ok: false, reason: 'format' })
    expect(validateManualBarcode('ABC123')).toEqual({ ok: false, reason: 'format' })
    expect(validateManualBarcode('https://example.com/shop')).toEqual({ ok: false, reason: 'format' })
  })

  it('refuses a mistyped digit (check digit)', () => {
    expect(validateManualBarcode('8000500310428')).toEqual({ ok: false, reason: 'check_digit' })
  })
})
