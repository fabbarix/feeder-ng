// The last Shop used on this device (functional spec §10.1), kept in localStorage. Plain TypeScript. Stubs until implemented.

export const LAST_SHOP_KEY = 'feeder.scan.lastShop'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The remembered Shop id, or null (nothing stored, not a positive integer, or storage unavailable/throwing). */
export function getLastShopId(storage: Store | null | undefined): number | null {
  void storage
  throw new Error('not implemented')
}

/** Remembers the Shop; null forgets it. Never throws. */
export function setLastShopId(storage: Store | null | undefined, id: number | null): void {
  void storage
  void id
  throw new Error('not implemented')
}
