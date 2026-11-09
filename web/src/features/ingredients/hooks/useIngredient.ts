import type { BaseUnit } from '../../../lib/units'
import type { Conversion, Ingredient, IngredientDetail } from '../types'

export interface UseIngredient {
  ingredient: IngredientDetail | undefined
  isLoading: boolean
  /** ApiError with status 404 when the id does not exist. */
  error: Error | null
  /** Sum of the reference counts; the Base Unit and deletion are locked while > 0. */
  referenceCount: number
  rename: (name: string) => Promise<Ingredient>
  setBaseUnit: (base: BaseUnit) => Promise<Ingredient>
  /** null clears the Shelf Life. */
  setShelfLife: (days: number | null) => Promise<Ingredient>
  setConversion: (c: Conversion) => Promise<Ingredient>
  removeConversion: (unit: string) => Promise<Ingredient>
  remove: () => Promise<void>
}

/** One Ingredient (react-query key ['ingredients', id]); every mutation refreshes it and the list. */
export function useIngredient(id: number): UseIngredient {
  void id
  throw new Error('TODO')
}
