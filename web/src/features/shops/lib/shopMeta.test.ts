// B9-30 (SET-14b): every Shop row has a meta line, "12 Prices · Location saved" or "No Prices yet · Location not saved". The count is
// `priceCount` on GET /api/shops (distinct Products with a Price at the Shop). Plain TypeScript, no React.
// API pinned (features/shops/lib/shopMeta.ts):
//   shopMeta(shop: { priceCount?: number; location?: ShopLocation | null }) -> string
//   Shop (features/products/types.ts) gains `priceCount?: number`.
import { describe, expect, it } from 'vitest'
import { shopMeta } from './shopMeta'

const here = { lat: 45.1, lon: 9.2 }

describe('shopMeta', () => {
  it('counts the Prices and says the Location is saved', () => {
    expect(shopMeta({ priceCount: 12, location: here })).toBe('12 Prices · Location saved')
  })
  it('says there are no Prices yet and the Location is not saved', () => {
    expect(shopMeta({ priceCount: 0, location: null })).toBe('No Prices yet · Location not saved')
  })
  it('reads one Price in the singular', () => {
    expect(shopMeta({ priceCount: 1, location: null })).toBe('1 Price · Location not saved')
  })
  it('an older server answer without priceCount still gets the Location half', () => {
    expect(shopMeta({ location: here })).toBe('Location saved')
    expect(shopMeta({})).toBe('Location not saved')
  })
})
