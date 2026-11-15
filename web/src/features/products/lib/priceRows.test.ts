// B9-30 (SET-04): the Product page's Price rows. A row is R-E: the Shop is the key, the price sits in the value column with the price
// per kg under it, and the detail is the locale date (plus how the per-kg price was worked out). Plain TypeScript, no React.
// API pinned (features/products/lib/priceRows.ts):
//   formatPriceDate(iso, today)          "5 Nov"; the year only when it is not the year of `today`: "5 Nov 2025"
//   priceRows(prices, shops, currency, today) -> PriceRow[], in the order given
//     PriceRow = { id, shopId, key: Shop name, value, subValue?, detail, label, price }
//   olderPrices(latest, all)             the Prices of `all` (newest first, as given) that are not in `latest`
import { describe, expect, it } from 'vitest'
import { formatPriceDate, olderPrices, priceRows } from './priceRows'
import type { Price, Shop } from '../types'

const shops: Shop[] = [
  { id: 1, name: 'Corner Market' },
  { id: 2, name: 'Coop' },
]
const price = (over: Partial<Price> & { id: number }): Price => ({ productId: 5, shopId: 1, date: '2026-11-05', priceCents: 159, pricePerKgCents: 227, pricePerKgDerived: false, ...over })
const TODAY = '2026-11-14'

describe('formatPriceDate', () => {
  it('is the day and the short month, without the year, in the current year', () => {
    expect(formatPriceDate('2026-11-05', TODAY)).toBe('5 Nov')
    expect(formatPriceDate('2026-01-31', TODAY)).toBe('31 Jan')
  })
  it('adds the year when it is not this year', () => {
    expect(formatPriceDate('2025-11-05', TODAY)).toBe('5 Nov 2025')
  })
})

describe('priceRows', () => {
  it('puts the Shop in the key and the price in the value, never in one joined title', () => {
    const [row] = priceRows([price({ id: 1 })], shops, 'USD', TODAY)
    expect(row).toMatchObject({ id: 1, shopId: 1, key: 'Corner Market', value: '$1.59', subValue: '$2.27 / kg', detail: '5 Nov' })
    expect(row!.key).not.toContain('·')
    expect(row!.key).not.toContain('2026')
  })

  it('says in the detail when the price per kg was worked out from the pack size', () => {
    const [row] = priceRows([price({ id: 1, pricePerKgDerived: true })], shops, 'USD', TODAY)
    expect(row!.detail).toBe('5 Nov · per kg from pack size')
    // the compact meta of a narrow row is the date alone (P23: the detail is never cut)
    expect(row!.date).toBe('5 Nov')
  })

  it('names the row "<Shop>, <price>, <date>" for a screen reader', () => {
    expect(priceRows([price({ id: 1 })], shops, 'USD', TODAY)[0]!.label).toBe('Corner Market, $1.59, 5 Nov')
  })

  it('a Price recorded only per kg shows the per-kg price as its value and has no sub-value', () => {
    const [row] = priceRows([price({ id: 2, priceCents: null, pricePerKgCents: 1200 })], shops, 'USD', TODAY)
    expect(row).toMatchObject({ value: '$12.00 / kg' })
    expect(row!.subValue).toBeUndefined()
    expect(row!.label).toBe('Corner Market, $12.00 / kg, 5 Nov')
  })

  it('a Price with no per-kg figure has no sub-value', () => {
    expect(priceRows([price({ id: 3, pricePerKgCents: null })], shops, 'USD', TODAY)[0]!.subValue).toBeUndefined()
  })

  it('keeps the order it is given and names an unknown Shop', () => {
    const rows = priceRows([price({ id: 4, shopId: 2 }), price({ id: 5, shopId: 99 })], shops, 'USD', TODAY)
    expect(rows.map((r) => r.key)).toEqual(['Coop', 'Unknown Shop'])
  })

  it('formats in the Household Currency', () => {
    expect(priceRows([price({ id: 6, priceCents: 350, pricePerKgCents: null })], shops, 'EUR', TODAY)[0]!.value).toBe('€3.50')
  })
})

describe('olderPrices (the history never repeats a latest row)', () => {
  const latest = [price({ id: 10, shopId: 1, date: '2026-11-14' }), price({ id: 11, shopId: 2, date: '2026-11-10' })]
  it('leaves out every latest Price and keeps the newest-first order of the rest', () => {
    const all = [latest[0]!, price({ id: 12, shopId: 1, date: '2026-11-12' }), latest[1]!, price({ id: 13, shopId: 2, date: '2026-10-01' })]
    expect(olderPrices(latest, all).map((p) => p.id)).toEqual([12, 13])
  })
  it('is empty when there is no history, so the history button is not drawn', () => {
    expect(olderPrices(latest, latest)).toEqual([])
    expect(olderPrices([], [])).toEqual([])
  })
})
