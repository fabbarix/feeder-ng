// B9-30 (SET-02): "Prices known here" reads GET /api/shops/{id}/prices (B9-06) and shows ListRow-shaped rows: the Product's Thumb,
// the name, the locale date as meta, the price as the value and the price per kg as the sub-value. The first 8 show; the rest sit
// behind "Show all N Prices". Plain TypeScript, no React.
// API pinned (features/shops/lib/shopPrices.ts):
//   SHOP_PRICES_SHOWN = 8
//   shopPriceRows(wire: ShopPriceWire[], currency, today) -> ShopPriceRow[]   wire = [{ product: {id,name,image?,imageUrl?}, price: Price }]
//     ShopPriceRow = { id (the Price id), productId, name, imageUrl?, meta (date), value, subValue?, href: '/products/:id', label }
//   shownPriceRows(rows, expanded) -> rows              the first 8, or all when expanded
//   hiddenPriceCount(rows) -> number
//   (features/shops/strings.ts) pricesKnownTitle 'Prices known here'; pricesCount(n) '12 Products' / '1 Product';
//   pricesNote(shop) 'The latest Price of each Product at Coop.'; showAllPrices(n) 'Show all 12 Prices'; pricesEmpty(shop).
import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import { hiddenPriceCount, SHOP_PRICES_SHOWN, shopPriceRows, shownPriceRows, type ShopPriceWire } from './shopPrices'

const wire = (id: number, name: string, over: Partial<ShopPriceWire['price']> = {}, product: Partial<ShopPriceWire['product']> = {}): ShopPriceWire => ({
  product: { id, name, image: '', imageUrl: '', ...product },
  price: { id: 100 + id, productId: id, shopId: 1, date: '2026-11-14', priceCents: 374, pricePerKgCents: 1496, pricePerKgDerived: true, ...over },
})
const TODAY = '2026-11-20'

describe('shopPriceRows', () => {
  it('a row has the Product as title, the date as meta, the price as value and the price per kg as sub-value', () => {
    const [row] = shopPriceRows([wire(7, 'Butter')], 'USD', TODAY)
    expect(row).toMatchObject({ id: 107, productId: 7, name: 'Butter', meta: '14 Nov', value: '$3.74', subValue: '$14.96 / kg', href: '/products/7' })
  })

  it('shows the year only when the Price is not from this year', () => {
    expect(shopPriceRows([wire(7, 'Butter', { date: '2025-12-24' })], 'USD', TODAY)[0]!.meta).toBe('24 Dec 2025')
  })

  it('names the row link "<Product>, <price> on <date>"', () => {
    expect(shopPriceRows([wire(7, 'Butter')], 'USD', TODAY)[0]!.label).toBe('Butter, $3.74 on 14 Nov')
  })

  it('has no sub-value when the price per kg is not known, and uses the per-kg price as value when only that is known', () => {
    expect(shopPriceRows([wire(7, 'Butter', { pricePerKgCents: null })], 'USD', TODAY)[0]!.subValue).toBeUndefined()
    const only = shopPriceRows([wire(8, 'Ham', { priceCents: null, pricePerKgCents: 1800, pricePerKgDerived: false })], 'USD', TODAY)[0]!
    expect(only.value).toBe('$18.00 / kg')
    expect(only.subValue).toBeUndefined()
  })

  it('carries the Product Picture address for the Thumb, and keeps the order the server gave (by name)', () => {
    const rows = shopPriceRows([wire(2, 'Apple jam', {}, { imageUrl: '/api/images/abc' }), wire(1, 'Butter')], 'USD', TODAY)
    expect(rows.map((r) => r.name)).toEqual(['Apple jam', 'Butter'])
    expect(rows[0]!.imageUrl).toBe('/api/images/abc')
    expect(rows[1]!.imageUrl).toBeUndefined()
  })
})

describe('the first 8 rows, then "Show all"', () => {
  const rows = shopPriceRows(Array.from({ length: 12 }, (_, i) => wire(i + 1, `Product ${i + 1}`)), 'USD', TODAY)
  it('shows 8 and counts the rest', () => {
    expect(SHOP_PRICES_SHOWN).toBe(8)
    expect(shownPriceRows(rows, false)).toHaveLength(8)
    expect(hiddenPriceCount(rows)).toBe(4)
  })
  it('shows all when expanded', () => {
    expect(shownPriceRows(rows, true)).toHaveLength(12)
  })
  it('8 rows or fewer have nothing hidden', () => {
    expect(hiddenPriceCount(rows.slice(0, 8))).toBe(0)
    expect(shownPriceRows(rows.slice(0, 3), false)).toHaveLength(3)
  })
})

describe('copy (strings.ts)', () => {
  it('is the chapter\'s', () => {
    expect(strings.pricesKnownTitle).toBe('Prices known here')
    expect(strings.pricesCount(12)).toBe('12 Products')
    expect(strings.pricesCount(1)).toBe('1 Product')
    expect(strings.pricesNote('Coop')).toBe('The latest Price of each Product at Coop.')
    expect(strings.showAllPrices(12)).toBe('Show all 12 Prices')
    expect(strings.pricesEmpty('Coop')).toBe('No Prices recorded at Coop yet. A Price is recorded when a receipt from Coop is read, or when you add one on a Product.')
  })
})
