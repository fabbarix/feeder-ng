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

/** RX-04: the Step row's state at its end: "10 min", "12 h before", or "No time" (untimed: true, drawn muted). */
export function stepTime(step: Pick<RecipeStep, 'kind' | 'durationMinutes' | 'leadTimeMinutes'>): { text: string; untimed: boolean } {
  const t = recipeStrings.stepRow
  if (step.kind === 'advance' && step.leadTimeMinutes > 0) return { text: t.before(formatMinutes(step.leadTimeMinutes)), untimed: false }
  if (step.kind !== 'advance' && step.durationMinutes > 0) return { text: formatMinutes(step.durationMinutes), untimed: false }
  return { text: t.noTime, untimed: true }
}

/** "After Step 2", "After Steps 3 and 4", "After Steps 2, 3 and 4" from the stored 0-based indexes; '' for none. */
export function afterText(after: readonly number[]): string {
  if (after.length === 0) return ''
  const numbers = after.map((i) => String(i + 1))
  const joined = numbers.length === 1 ? numbers[0]! : `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
  return recipeStrings.stepRow.after(joined, numbers.length)
}

/**
 * RX-04: the Step row's muted detail: its kind, then the Steps it comes after, then what it uses ("Passive · After Step 1 · Uses 250 g
 * flour"). It may wrap; it never carries the time, which is the state at the end of the row.
 */
export function stepDetail(step: Pick<RecipeStep, 'kind' | 'after' | 'uses'>, refs: ReadonlyMap<number, IngredientRef>, system: UnitSystem): string {
  return [kindWord[step.kind], afterText(step.after), usesText(step.uses, refs, system)].filter((part) => part !== '').join(' · ')
}
