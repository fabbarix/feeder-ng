// Beta.5 F7 (Q24): the Recipes sort, in the URL (?sort=) and remembered on the device. React hook.
import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getStoredSort, setStoredSort } from '../lib/sortChoice'
import { parseSort, resolveSort, type RecipeSort } from '../lib/sort'

type Storage_ = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface UseRecipeSort {
  sort: RecipeSort
  /** Puts the sort in the URL (replacing the history entry, other parameters kept) and remembers it on the device. */
  setSort: (sort: RecipeSort) => void
}

/** The browser's localStorage, or null when the browser blocks it. */
function browserStorage(): Storage_ | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Must be rendered inside a router. The URL's valid `sort` wins; else the remembered one (which is then written to the
 * URL, replacing the entry, so the address shows what is on screen); else 'name'. `storage` is injectable (default
 * window.localStorage, guarded: it may be missing or throw).
 */
export function useRecipeSort(storage?: Storage_ | null): UseRecipeSort {
  const [params, setParams] = useSearchParams()
  const store = storage === undefined ? browserStorage() : storage
  const fromUrl = params.get('sort')
  const remembered = getStoredSort(store)
  const sort = resolveSort(fromUrl, remembered)
  const fromUrlValid = parseSort(fromUrl) !== null
  const rememberedValid = parseSort(remembered) !== null

  useEffect(() => {
    if (fromUrlValid || !rememberedValid) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('sort', sort)
        return next
      },
      { replace: true },
    )
  }, [fromUrlValid, rememberedValid, sort, setParams])

  const setSort = useCallback(
    (next: RecipeSort) => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev)
          copy.set('sort', next)
          return copy
        },
        { replace: true },
      )
      setStoredSort(store, next)
    },
    [setParams, store],
  )

  return { sort, setSort }
}
