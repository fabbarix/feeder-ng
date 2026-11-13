// SR2: per pack <-> per kg (per l for ml) for the Price entry (spec 13.4, S3). Pure integer maths, half up
// (the same rounding as the server's product.PriceForWeight). Pieces have a Price per pack only.
import { describe, expect, it } from 'vitest'
import { packFromPerKg, perKgFromPack, priceBasisOptions, supportsPerKg, weighedPrice } from './perKgPrice'

describe('ui/lib/perKgPrice: which Products have a per kg Price', () => {
  it('g and ml do, piece does not (S3)', () => {
    expect(supportsPerKg('g')).toBe(true)
    expect(supportsPerKg('ml')).toBe(true)
    expect(supportsPerKg('piece')).toBe(false)
  })

  it('offers the toggle "per pack" and "per kg" for g, "per pack" and "per l" for ml, and none for pieces', () => {
    expect(priceBasisOptions('g')).toEqual([
      { value: 'pack', label: 'per pack' },
      { value: 'perKg', label: 'per kg' },
    ])
    expect(priceBasisOptions('ml')).toEqual([
      { value: 'pack', label: 'per pack' },
      { value: 'perKg', label: 'per l' },
    ])
    expect(priceBasisOptions('piece')).toEqual([])
  })
})

describe('ui/lib/perKgPrice: the conversion helper', () => {
  it('€1.45 for 500 g is €2.90/kg (the spec\'s example)', () => {
    expect(perKgFromPack(145, 500, 'g')).toBe(290)
  })

  it('works per l for ml packs', () => {
    expect(perKgFromPack(129, 750, 'ml')).toBe(172)
    expect(perKgFromPack(199, 1000, 'ml')).toBe(199)
  })

  it('rounds half up', () => {
    expect(perKgFromPack(1, 400, 'g')).toBe(3) // 2.5
    expect(perKgFromPack(100, 300, 'g')).toBe(333) // 333.33
  })

  it('is null for pieces and for a pack size that is not above 0', () => {
    expect(perKgFromPack(145, 6, 'piece')).toBeNull()
    expect(perKgFromPack(145, 0, 'g')).toBeNull()
  })

  it('goes back: €2.90/kg for a 500 g pack is a €1.45 pack Price', () => {
    expect(packFromPerKg(290, 500, 'g')).toBe(145)
    expect(packFromPerKg(199, 250, 'g')).toBe(50) // 49.75
    expect(packFromPerKg(2, 250, 'g')).toBe(1) // 0.5 rounds up
    expect(packFromPerKg(290, 6, 'piece')).toBeNull()
  })

  it('prices a weighed amount: €19.90/kg for 312 g is €6.21', () => {
    expect(weighedPrice(1990, 312)).toBe(621) // 620.88
    expect(weighedPrice(5, 100)).toBe(1) // 0.5 rounds up
    expect(weighedPrice(1990, 0)).toBe(0)
  })
})
