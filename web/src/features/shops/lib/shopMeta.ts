// The Shops list's row meta (SET-14b): "12 Prices · Location saved". Plain TypeScript, no React.
import { strings } from '../strings'
import type { ShopLocation } from '../types'

export function shopMeta(shop: { priceCount?: number; location?: ShopLocation | null }): string {
  const location = shop.location ? strings.metaLocationSaved : strings.metaLocationNone
  if (shop.priceCount === undefined) return location
  return `${strings.metaPrices(shop.priceCount)} · ${location}`
}
