// The text of a Step and of its uses on the Recipe detail (ui-fix-plan 5.9). Plain TypeScript.
import type { UnitSystem } from '../../../lib/units'
import type { IngredientRef, RecipeStep, StepKind, StepUse } from '../types'
import { recipeStrings } from '../strings'
import { quantityText } from './lineUnits'
import { formatMinutes } from './time'

const kindWord: Record<StepKind, string> = {
  active: recipeStrings.steps.active,
  passive: recipeStrings.steps.passive,
  advance: recipeStrings.steps.advance,
}

/** "Passive · 40 min", "Advance Step · 4 h before", "Active" (with its duration when it has one). */
export function stepMeta(step: Pick<RecipeStep, 'kind' | 'durationMinutes' | 'leadTimeMinutes'>): string {
  const word = kindWord[step.kind]
  if (step.kind === 'advance') return `${word} · ${formatMinutes(step.leadTimeMinutes)} before`
  return step.durationMinutes > 0 ? `${word} · ${formatMinutes(step.durationMinutes)}` : word
}

/** "Uses 2 clove garlic, 250 g flour" for the uses of a Step; '' when it uses nothing. */
export function usesText(uses: StepUse[], refs: ReadonlyMap<number, IngredientRef>, system: UnitSystem): string {
  if (uses.length === 0) return ''
  const parts = uses.map((u) => `${quantityText(u.quantity, u.unit, refs.get(u.ingredientId), system)} ${refs.get(u.ingredientId)?.name ?? ''}`.trim())
  return recipeStrings.steps.usesLine(parts.join(', '))
}
