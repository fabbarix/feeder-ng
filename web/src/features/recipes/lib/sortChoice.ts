// Beta.5 F7 (Q24): the Recipes sort remembered on this device, in localStorage. Plain TypeScript. Stubs until implemented.

export const RECIPE_SORT_KEY = 'feeder.recipes.sort'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The remembered sort string, or null (nothing stored, or storage missing or throwing). Not validated: see resolveSort. */
export function getStoredSort(_storage: Store | null | undefined): string | null {
  return null
}

/** Remembers the sort. Never throws. */
export function setStoredSort(_storage: Store | null | undefined, _sort: string): void {}
