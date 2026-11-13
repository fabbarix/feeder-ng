// H5 (ADR 0017, household-items.md section 6): the pure rules of Supplies in the web catalogue. Plain TypeScript, no React.
import { ApiError } from '../../../lib/http'
import { baseUnitLabel, formatQuantity, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { strings } from '../strings'
import type { Ingredient, IngredientKind, NewIngredient } from '../types'
import { ingredientMeta } from './names'

/** A food Ingredient unless its kind says otherwise (older fixtures have no kind). */
export function kindOf(ingredient: { kind?: IngredientKind }): IngredientKind {
  return ingredient.kind ?? 'food'
}

/** Each kind has its own list route: /ingredients for food, /supplies for a Supply (decision D5). */
export function kindBasePath(kind: IngredientKind): string {
  return kind === 'supply' ? '/supplies' : '/ingredients'
}

const REASON_WORDS = new Map<string, string>(Object.entries(strings.kind.reasons))

/** The 409 kind_in_use reason codes, in words, in the server's order; a code this build does not know is dropped. */
export function kindInUseReasons(codes: readonly string[]): string[] {
  return codes.flatMap((code) => {
    const words = REASON_WORDS.get(code)
    return words === undefined ? [] : [words]
  })
}

/** The title of the refusal: named by the kind the change was going to become. */
export function kindInUseTitle(target: IngredientKind): string {
  return target === 'supply' ? strings.kind.refusalTitle.supply : strings.kind.refusalTitle.food
}

/** The reason codes of a 409 kind_in_use ApiError ([] when it carries none); null for any other error. */
export function kindInUseFrom(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.code !== 'kind_in_use') return null
  const reasons = error.details.reasons
  return Array.isArray(reasons) ? reasons.filter((r): r is string => typeof r === 'string') : []
}

export type RestockCheck = { ok: true; value: number | null } | { ok: false; error: string }

/** A Restock level in Base Units: null (none) or a finite number above 0. */
export function checkRestockLevel(level: number | null): RestockCheck {
  if (level === null) return { ok: true, value: null }
  if (!Number.isFinite(level) || level <= 0) return { ok: false, error: strings.errors.amountInvalid }
  return { ok: true, value: level }
}

/** The text of a Restock level field: blank for none, else the number as typed (Base Units). */
export function restockText(level: number | null): string {
  return level === null ? '' : String(level)
}

/** A typed Restock level: blank is none; a comma is read as a decimal point. Anything else must pass checkRestockLevel. */
export function parseRestockText(text: string): RestockCheck {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: null }
  const parsed = Number(trimmed.replace(',', '.'))
  return checkRestockLevel(Number.isFinite(parsed) ? parsed : Number.NaN)
}

/** The Restock level in the household display (Base Units converted), e.g. "Below 500 ml", "Below 2 cups", "Below 6 pieces". */
export function restockSummary(level: number | null, baseUnit: BaseUnit, system: UnitSystem): string {
  if (level === null) return strings.restock.none
  return strings.restock.below(formatQuantity(level, baseUnit, system))
}

/** The row meta of a Supply: its Base Unit label, then the level when there is one ("piece · restocks below 6 pieces"). */
export function supplyMeta(label: string, level: number | null, baseUnit: BaseUnit, system: UnitSystem): string {
  if (level === null) return label
  return `${label} · ${strings.restock.metaBelow(formatQuantity(level, baseUnit, system))}`
}

/** The row meta of any Ingredient in a list: a Supply shows its Restock level, food its Shelf Life. */
export function rowMeta(ingredient: Ingredient, system: UnitSystem): string {
  const label = baseUnitLabel(ingredient.baseUnit, system)
  if (kindOf(ingredient) === 'supply') return supplyMeta(label, ingredient.restockLevel ?? null, ingredient.baseUnit, system)
  return ingredientMeta(label, ingredient.shelfLifeDays)
}

/** A body for POST /api/ingredients that is always food: quick create from a Recipe line never makes a Supply, and drops a Restock level. */
export function asFood(body: NewIngredient): NewIngredient {
  const food: NewIngredient = { ...body, kind: 'food' }
  delete food.restockLevel
  return food
}

/** The words of a list and page for one kind: food keeps the Ingredients words, a Supply has its own. */
export function wordsFor(kind: IngredientKind) {
  return kind === 'supply' ? strings.supply : foodWords
}

const foodWords = {
  title: strings.title,
  searchLabel: strings.searchLabel,
  newLabel: strings.newIngredient,
  createLabel: strings.createIngredient,
  notFoundTitle: strings.notFoundTitle,
  mergeInto: strings.mergeInto,
  deleteLabel: strings.deleteIngredient,
  emptyTitle: strings.emptyTitle,
  emptyText: strings.emptyText,
  noMatches: strings.noMatches,
  detailsLabel: strings.detailsLabel,
  mergeTitle: strings.mergeTitle,
  mergeFindLabel: strings.mergeFindLabel,
  mergeCandidatesLabel: strings.mergeCandidatesLabel,
  mergeChangeTarget: strings.mergeChangeTarget,
  mergeBlocked: strings.mergeBlocked,
  nameRequired: strings.sheet.nameRequired,
}
