// The Product page's Price rows (SET-04): R-E rows with the Shop as key, the price in the value column and the price per kg under it.
// Plain TypeScript, no React.
import { formatMinor, formatPricePerKg } from './money'
import { strings } from '../strings'
import type { Price, Shop } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "5 Nov"; with the year ("5 Nov 2025") only when it is not the year of `today` (both YYYY-MM-DD). */
export function formatPriceDate(iso: string, today: string): string {
  const [y, m, d] = iso.split('-')
  const month = MONTHS[Number(m) - 1] ?? m
  const day = `${Number(d)} ${month}`
  return y === today.slice(0, 4) ? day : `${day} ${y}`
}

export interface PriceRow {
  id: number
  shopId: number
  /** the Shop's name */
  key: string
  /** the price, or the price per kg when only that is known */
  value: string
  /** the price per kg under the price */
  subValue?: string
  /** the locale date, plus how the per-kg price was worked out */
  detail: string
  /** the date alone: the row's compact meta, so a narrow row never cuts its detail (SSP-05 / P23) */
  date: string
  /** "<Shop>, <price>, <date>" */
  label: string
  price: Price
}

/** The price and its per-kg sub-value of one Price (shared with the Shop page's rows). */
export function priceValues(p: Price, currency: string): { value: string; subValue?: string } {
  if (p.priceCents != null) {
    return p.pricePerKgCents != null
      ? { value: formatMinor(p.priceCents, currency), subValue: formatPricePerKg(p.pricePerKgCents, currency) }
      : { value: formatMinor(p.priceCents, currency) }
  }
  return { value: p.pricePerKgCents != null ? formatPricePerKg(p.pricePerKgCents, currency) : strings.none }
}

/** One row per Price, in the order given. */
export function priceRows(prices: Price[], shops: Shop[], currency: string, today: string): PriceRow[] {
  return prices.map((p) => {
    const key = shops.find((s) => s.id === p.shopId)?.name ?? strings.unknownShop
    const date = formatPriceDate(p.date, today)
    const values = priceValues(p, currency)
    const detail = p.pricePerKgDerived && p.priceCents != null && p.pricePerKgCents != null ? `${date} · ${strings.perKgFromPack}` : date
    return { id: p.id, shopId: p.shopId, key, ...values, detail, date, label: `${key}, ${values.value}, ${date}`, price: p }
  })
}

/** The Prices of `all` (newest first, as given) that are not one of the `latest`: the history, never repeating a latest row. */
export function olderPrices(latest: Price[], all: Price[]): Price[] {
  const ids = new Set(latest.map((p) => p.id))
  return all.filter((p) => !ids.has(p.id))
}
