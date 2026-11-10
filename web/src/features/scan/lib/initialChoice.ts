// What the Scan screen starts with (QA: the picker re-asked although a last-used Shop existed). Plain TypeScript.

export type ScanChoice = { kind: 'shop'; shop: { id: number; name: string } } | { kind: 'stocktake' }

/**
 * The session to start with: the last Shop used when it is one of `shops` (spec §10.1: "the last Shop used first"
 * becomes "straight to it"); otherwise null = show the picker. Never starts a Stock-take by itself.
 */
export function initialChoice(shops: { id: number; name: string }[], lastShopId: number | null): ScanChoice | null {
  if (lastShopId === null) return null
  const shop = shops.find((s) => s.id === lastShopId)
  return shop ? { kind: 'shop', shop: { id: shop.id, name: shop.name } } : null
}
