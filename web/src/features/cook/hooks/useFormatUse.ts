import { useCallback } from 'react'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { useIngredientRefs } from '../../recipes/hooks/useIngredientRefs'
import { quantityText } from '../../recipes/lib/lineUnits'
import type { StepUse } from '../types'

/**
 * Formats one scaled Step use for display in the User's metric/imperial choice:
 * `${quantityText(use.quantity, use.unit, ingredientRef, system)} ${use.ingredient}`, with the system from
 * useDisplayUnitSystem and the Ingredient (Base Unit, Unit Conversions) from useIngredientRefs().byId.get(use.ingredientId).
 * An Ingredient that is not loaded yet shows the use as typed.
 */
export function useFormatUse(): (use: StepUse) => string {
  const system = useDisplayUnitSystem()
  const { byId } = useIngredientRefs()
  return useCallback(
    (use: StepUse) => `${quantityText(use.quantity, use.unit, byId.get(use.ingredientId), system)} ${use.ingredient}`,
    [byId, system],
  )
}
