import type { ReactNode } from 'react'

export interface IngredientExclusionListProps {
  ingredientId: number
  /** The Ingredient's name as the buttons say it: "Sam: excludes garlic". */
  ingredientName: string
}

/**
 * STUB (PT, step 1): who excludes the Ingredient, one row per Member (Avatar, name, toggle). Reads and writes through
 * useHouseholdPreferences; used by the Recipe line's Dialog and the Ingredient page's Excluded by Tile (rx-pt.md section 5.4).
 */
export function IngredientExclusionList(props: IngredientExclusionListProps): ReactNode {
  void props
  return null
}
