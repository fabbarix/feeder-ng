// "Prices known here" on the Shop page (SET-02), from GET /api/shops/{id}/prices. Plain TypeScript, no React.
import { formatPriceDate, priceValues } from '../../products/lib/priceRows'
import type { Price } from '../../products/types'

export const SHOP_PRICES_SHOWN = 8

export interface ShopPriceWire {
  product: { id: number; name: string; image?: string; imageUrl?: string }
  price: Price
}

export interface ShopPriceRow {
  /** the Price id */
  id: number
  productId: number
  name: string
  imageUrl?: string
  /** the locale date */
  meta: string
  value: string
  subValue?: string
  href: string
  /** "<Product>, <price> on <date>" */
  label: string
}

/** One row per Product, in the server's order (by name). */
export function shopPriceRows(wire: ShopPriceWire[], currency: string, today: string): ShopPriceRow[] {
  return wire.map(({ product, price }) => {
    const meta = formatPriceDate(price.date, today)
    const values = priceValues(price, currency)
    return {
      id: price.id,
      productId: product.id,
      name: product.name,
      ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
      meta,
      ...values,
      href: `/products/${product.id}`,
      label: `${product.name}, ${values.value} on ${meta}`,
    }
  })
}

/** The first SHOP_PRICES_SHOWN rows, or all of them when expanded. */
export function shownPriceRows<T>(rows: T[], expanded: boolean): T[] {
  return expanded ? rows : rows.slice(0, SHOP_PRICES_SHOWN)
}

/** How many rows "Show all" would add. */
export function hiddenPriceCount(rows: unknown[]): number {
  return Math.max(0, rows.length - SHOP_PRICES_SHOWN)
}
