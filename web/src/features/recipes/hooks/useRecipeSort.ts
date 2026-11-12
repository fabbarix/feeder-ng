// Beta.5 F7 (Q24): the Recipes sort, in the URL (?sort=) and remembered on the device. React hook. Stubs until implemented.
import type { RecipeSort } from '../lib/sort'

type Storage_ = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface UseRecipeSort {
  sort: RecipeSort
  /** Puts the sort in the URL (replacing the history entry, other parameters kept) and remembers it on the device. */
  setSort: (sort: RecipeSort) => void
}

/**
 * Must be rendered inside a router. The URL's valid `sort` wins; else the remembered one (which is then written to the
 * URL, replacing the entry, so the address shows what is on screen); else 'name'. `storage` is injectable (default
 * window.localStorage, guarded: it may be missing or throw).
 */
export function useRecipeSort(_storage?: Storage_ | null): UseRecipeSort {
  return { sort: 'name', setSort: () => {} }
}
