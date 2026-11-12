import type { ReactNode } from 'react'
import type { RecipeSort } from '../lib/sort'

export interface RecipeSortSelectProps {
  value: RecipeSort
  onChange: (sort: RecipeSort) => void
}

/** Beta.5 F7: the Sort select of the Recipes list, built on the shared Select (no native control). Stub until implemented. */
export function RecipeSortSelect(_props: RecipeSortSelectProps): ReactNode {
  return null
}
