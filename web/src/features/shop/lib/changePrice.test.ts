// B9-43 (SSP-13): what "Change the Price" saves: PUT /api/products/{id}/prices {shopId, date, priceCents?, pricePerKgCents?} (PriceBody).
//   priceBodyOf(entry, {shopId, date}) -> PriceBody | null
// A pack Price sends priceCents; a per kg Price sends pricePerKgCents and, when the pack is known, the pack Price it implies. Nothing valid typed: null.
import { describe, expect, it } from 'vitest'
import { priceBodyOf } from './changePrice'

const on = { shopId: 1, date: '2026-11-15' }

describe('priceBodyOf', () => {
  it('a pack Price: shop, date and priceCents', () => {
    expect(priceBodyOf({ basis: 'pack', cents: 349, packCents: 349, perKgCents: null }, on)).toEqual({ shopId: 1, date: '2026-11-15', priceCents: 349 })
  })

  it('a per kg Price: pricePerKgCents, and the pack Price it implies', () => {
    expect(priceBodyOf({ basis: 'perKg', cents: 500, packCents: 350, perKgCents: 500 }, on)).toEqual({ shopId: 1, date: '2026-11-15', priceCents: 350, pricePerKgCents: 500 })
  })

  it('nothing valid typed (cents null): null, nothing is saved', () => {
    expect(priceBodyOf({ basis: 'pack', cents: null, packCents: null, perKgCents: null }, on)).toBeNull()
  })
})
