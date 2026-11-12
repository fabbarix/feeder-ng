// Beta.5 F7 (Q24): the Recipes sort remembered on this device, in localStorage. Plain TypeScript.

export const RECIPE_SORT_KEY = 'feeder.recipes.sort'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The remembered sort string, or null (nothing stored, or storage missing or throwing). Not validated: see resolveSort. */
export function getStoredSort(storage: Store | null | undefined): string | null {
  try {
    return storage?.getItem(RECIPE_SORT_KEY) ?? null
  } catch {
    return null
  }
}

/** Remembers the sort. Never throws. */
export function setStoredSort(storage: Store | null | undefined, sort: string): void {
  try {
    storage?.setItem(RECIPE_SORT_KEY, sort)
  } catch {
    // Storage blocked or full: the sort still works for this visit.
  }
}
