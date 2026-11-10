import { describe, expect, it } from 'vitest'
import { barcodeKind, formatBarcode } from './barcodeFormat'

describe('barcodeKind', () => {
  it('reads a padded EAN-13', () => expect(barcodeKind('08001505005707')).toBe('EAN-13'))
  it('reads a padded UPC-A (two leading zeros)', () => expect(barcodeKind('00036000291452')).toBe('UPC-A'))
  it('reads a padded EAN-8 (six leading zeros)', () => expect(barcodeKind('00000096385074')).toBe('EAN-8'))
  it('keeps a trade-unit GTIN-14', () => expect(barcodeKind('18001505005704')).toBe('GTIN-14'))
  it('does not classify opaque or odd-length codes', () => {
    expect(barcodeKind('PRIVATE-77')).toBe('other')
    expect(barcodeKind('8001505005707')).toBe('other')
    expect(barcodeKind('')).toBe('other')
  })
})

describe('formatBarcode', () => {
  it('shows a stored EAN-13 as printed, grouped 1-6-6', () => {
    expect(formatBarcode('08001505005707')).toBe('8 001505 005707')
  })
  it('shows a stored UPC-A as 12 digits grouped 1-5-5-1', () => {
    expect(formatBarcode('00036000291452')).toBe('0 36000 29145 2')
  })
  it('shows a stored EAN-8 grouped 4-4', () => {
    expect(formatBarcode('00000096385074')).toBe('9638 5074')
  })
  it('splits the indicator digit off a GTIN-14', () => {
    expect(formatBarcode('18001505005704')).toBe('1 · 8 001505 005704')
  })
  it('formats shorter canonical forms as they are', () => {
    expect(formatBarcode('8001505005707')).toBe('8 001505 005707')
    expect(formatBarcode('96385074')).toBe('9638 5074')
  })
  it('never shows the 14-digit padding', () => {
    expect(formatBarcode('08001505005707')).not.toMatch(/^0/)
    expect(formatBarcode('08001505005707').replace(/\s/g, '')).toHaveLength(13)
  })
  it('returns opaque codes unchanged', () => {
    expect(formatBarcode('PRIVATE-77')).toBe('PRIVATE-77')
    expect(formatBarcode('')).toBe('')
  })
})
