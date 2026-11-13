// DS-TODAY: the one place Today reads the Shop list (kept out of seams.ts, whose tests mock ../shop with ShoppingScreen only).
// "Lines to get" = the Lines of the default Shopping List that are not ticked yet.
import { useShoppingList } from '../shop'
import { countLinesToGet } from './lib/metrics'

export interface LinesToGet {
  count: number
  loading: boolean
}

/** The Lines to get, 0 while the list loads or when it failed. */
export function useLinesToGet(): LinesToGet {
  const list = useShoppingList({ shopId: null })
  return { count: countLinesToGet(list.data?.lines), loading: list.isLoading }
}
