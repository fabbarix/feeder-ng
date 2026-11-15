import type { ReactNode } from 'react'
import type { BaseUnit, IngredientMatch, UnitPrompt } from '../types'

export interface IngredientMatchRowProps {
  match: IngredientMatch
  /** The unit question of this Ingredient that is still open, if any (asked on the row, RX-12). */
  prompt?: UnitPrompt
  onUseExisting: (ingredientId: number) => void
  onCreate: (opts?: { name?: string; baseUnit?: BaseUnit }) => void
  onAnswerConversion: (unit: string, toBase: number) => void
}

/** B9-28 (RX-12): stub, not built yet. It replaces IngredientMatchTile and UnitPromptTile. See IngredientMatchRow.test.tsx. */
export function IngredientMatchRow(_props: IngredientMatchRowProps): ReactNode {
  return null
}
