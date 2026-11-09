import type { UnitSystem } from '../../../lib/units'
import type { Ingredient } from '../types'

export interface IngredientListProps {
  ingredients: readonly Ingredient[]
  system: UnitSystem
  onOpen: (id: number) => void
}

/** One tile-row per Ingredient: name, a Base Unit chip (g/oz, ml/fl oz, piece), a Shelf Life chip when set. The row is a button named by the Ingredient. */
export function IngredientList(props: IngredientListProps) {
  void props
  return null
}
