import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { StockWarning } from '../types'

/**
 * The Set total prefill for the one-tap correction: what Stock holds after the Cooked
 * meal. A warning means Stock floored at 0, so this is 0 in practice.
 */
export function correctionDefault(warning: StockWarning): number {
  return Math.max(0, warning.have - warning.need)
}

/** The shortfall sentence in the User's unit system (same wording as the server's message). */
export function shortfallMessage(warning: StockWarning, system: UnitSystem = 'metric'): string {
  const need = formatQuantity(warning.need, warning.baseUnit, system)
  if (warning.have <= 0) return `Stock shows no ${warning.name}, the recipe uses ${need}`
  return `Stock shows only ${formatQuantity(warning.have, warning.baseUnit, system)} ${warning.name}, the recipe uses ${need}`
}

// ---- B9-45 (PC-02): the one Stock-shortfall notice and the one Correct Stock sheet. ----

/** One Cooked meal's Stock warnings: the notice lists them as rows, grouped by meal (amounts are never summed across Recipes). */
export interface ShortfallGroup {
  /** Unique per Cooked meal: "2026-11-14/3/1" (date/slot/Course); "2026-11-14/3" for a Mark all Cooked. */
  id: string
  /** "Sat Dinner". */
  mealLabel: string
  /** The Recipe that was cooked; null when the warnings of several Recipes arrive together (a Mark all Cooked of several Courses). */
  recipeName: string | null
  warnings: StockWarning[]
}

/** One row of the notice: key (name), state at the end ("none in Stock", "200 g short"), muted detail. */
export interface ShortfallRow {
  /** `${group.id}:${ingredientId}`. */
  key: string
  groupId: string
  ingredientId: number
  name: string
  state: string
  detail: string
}

/** One row of the Correct Stock sheet: one per Ingredient, however many Recipes used it. */
export interface CorrectionRow {
  ingredientId: number
  name: string
  baseUnit: StockWarning['baseUnit']
  /** "The Recipe used 1 kg · Stock showed none". */
  detail: string
}

/** "none in Stock" (nothing was in Stock), else "<missing> short" ("200 g short"). */
export function shortfallState(warning: StockWarning, system: UnitSystem = 'metric'): string {
  if (warning.have <= 0) return 'none in Stock'
  const missing = Math.max(0, warning.need - warning.have)
  return `${formatQuantity(missing, warning.baseUnit, system)} short`
}

const used = (warning: StockWarning, system: UnitSystem, subject: string): string =>
  `${subject} used ${formatQuantity(warning.need, warning.baseUnit, system)}`

const showed = (warning: StockWarning, system: UnitSystem): string =>
  `Stock showed ${warning.have <= 0 ? 'none' : formatQuantity(warning.have, warning.baseUnit, system)}`

/** "The Recipe used 300 g · Stock showed 100 g"; with nothing in Stock the second part is left out (the state says it). `subject` is "The Recipe", a Recipe name or "Cooking". */
export function shortfallDetail(warning: StockWarning, system: UnitSystem, subject: string): string {
  if (warning.have <= 0) return used(warning, system, subject)
  return `${used(warning, system, subject)} · ${showed(warning, system)}`
}

/** The subject of a group's detail: "Cooking" without a Recipe, the Recipe's name when several Recipes are listed, else "The Recipe". */
function subjectFor(groups: ShortfallGroup[]): (group: ShortfallGroup) => string {
  const named = new Set(groups.filter((g) => g.warnings.length > 0 && g.recipeName !== null).map((g) => g.recipeName))
  return (group) => (group.recipeName === null ? 'Cooking' : named.size > 1 ? group.recipeName : 'The Recipe')
}

/** One row per Ingredient and group, in group order. The subject is "The Recipe" while one Recipe is named across the groups, each Recipe's own name when several are, "Cooking" for a null recipeName. */
export function shortfallRows(groups: ShortfallGroup[], system: UnitSystem = 'metric'): ShortfallRow[] {
  const subject = subjectFor(groups)
  return groups.flatMap((group) =>
    group.warnings.map((warning) => ({
      key: `${group.id}:${warning.ingredientId}`,
      groupId: group.id,
      ingredientId: warning.ingredientId,
      name: warning.name,
      state: shortfallState(warning, system),
      detail: shortfallDetail(warning, system, subject(group)),
    })),
  )
}

const distinctIngredients = (groups: ShortfallGroup[]): StockWarning[] => {
  const seen = new Map<number, StockWarning>()
  for (const g of groups) for (const w of g.warnings) if (!seen.has(w.ingredientId)) seen.set(w.ingredientId, w)
  return [...seen.values()]
}

/** "Stock was short for Cauliflower" (one Ingredient) or "Stock was short for 3 Ingredients" (distinct Ingredients). */
export function shortfallTitle(groups: ShortfallGroup[]): string {
  const all = distinctIngredients(groups)
  if (all.length === 1) return `Stock was short for ${all[0]!.name}`
  return `Stock was short for ${all.length} Ingredients`
}

/** The Correct Stock sheet's rows: one per distinct Ingredient, first seen first. */
export function correctionRows(groups: ShortfallGroup[], system: UnitSystem = 'metric'): CorrectionRow[] {
  const subject = subjectFor(groups)
  return distinctIngredients(groups).map((first) => {
    const uses = groups.flatMap((g) => g.warnings.filter((w) => w.ingredientId === first.ingredientId).map((w) => used(w, system, subject(g))))
    return {
      ingredientId: first.ingredientId,
      name: first.name,
      baseUnit: first.baseUnit,
      detail: [...uses, showed(first, system)].join(' · '),
    }
  })
}

/** The Stepper step of a row, in Base Units: g and ml 10, piece 1. */
export function correctionStep(baseUnit: StockWarning['baseUnit']): number {
  return baseUnit === 'piece' ? 1 : 10
}

/** One Stock-take per changed row: the rows whose value is above 0 (0 is where Stock stays). */
export function correctionWrites(rows: CorrectionRow[], values: Record<number, number>): { ingredientId: number; total: number }[] {
  return rows.flatMap((row) => {
    const total = values[row.ingredientId] ?? 0
    return total > 0 ? [{ ingredientId: row.ingredientId, total }] : []
  })
}

/** "Stock corrected for 2 Ingredients" ("... for 1 Ingredient"). */
export function correctedText(count: number): string {
  return `Stock corrected for ${count} ${count === 1 ? 'Ingredient' : 'Ingredients'}`
}

/** The Correct Stock sheet's context line: "After cooking Cauliflower al gorgonzola" (one Recipe), else the meals: "After cooking Sat Dinner and Sun Lunch". */
export function correctionContext(groups: ShortfallGroup[]): string {
  const shown = groups.filter((g) => g.warnings.length > 0)
  const recipes = [...new Set(shown.map((g) => g.recipeName))]
  if (recipes.length === 1 && recipes[0]) return `After cooking ${recipes[0]}`
  const meals = [...new Set(shown.map((g) => g.mealLabel))]
  return meals.length > 0 ? `After cooking ${meals.join(' and ')}` : 'After cooking'
}
