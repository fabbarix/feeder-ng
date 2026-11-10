// The last Shop used on this device (functional spec §10.1), kept in localStorage. Plain TypeScript. Stubs until implemented.

export const LAST_SHOP_KEY = 'feeder.scan.lastShop'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The remembered Shop id, or null (nothing stored, not a positive integer, or storage unavailable/throwing). */
export function getLastShopId(storage: Store | null | undefined): number | null {
  try {
    const raw = storage?.getItem(LAST_SHOP_KEY)
    if (!raw || !/^[1-9]\d*$/.test(raw)) return null
    return Number(raw)
  } catch {
    return null
  }
}

/** Remembers the Shop; null forgets it. Never throws. */
export function setLastShopId(storage: Store | null | undefined, id: number | null): void {
  try {
    if (id === null) storage?.removeItem(LAST_SHOP_KEY)
    else storage?.setItem(LAST_SHOP_KEY, String(id))
  } catch {
    // Storage unavailable: the choice is simply not remembered.
  }
}
