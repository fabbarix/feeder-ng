import type { IconName } from '../../../ui/icons'
import type { BaseUnit } from '../../../lib/units'
import type { Ingredient, IngredientKind, NewIngredient, SearchResult, Suggestion } from '../types'
import { parseRestockText } from './kind'

// R14 (docs/dev/design/r14-recipe-editor.md): pure rules of the New Ingredient sheet.
import { strings } from '../strings'

/**
 * The Base Unit to preselect when the sheet is opened with a unit already known (the unit typed on a Recipe line, or on a Scan).
 * g, kg, oz, lb -> g; ml, l, dl, cl, tsp, tbsp, cup, fl oz -> ml; piece -> piece; blank, null or a custom unit (clove, can) -> g.
 * Trimmed, case-insensitive.
 */
export function defaultBaseUnit(unit?: string | null): BaseUnit {
  const u = (unit ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (ML_UNITS.has(u)) return 'ml'
  if (u === 'piece') return 'piece'
  return 'g'
}

const ML_UNITS = new Set(['ml', 'l', 'dl', 'cl', 'tsp', 'tbsp', 'cup', 'fl oz'])

/** The registry icon of a Base Unit option: g -> 'weigh' (Scales), ml -> 'liquid' (Drop), piece -> 'piece' (Cube). The last two are new glyphs (UF1 registry). */
export function baseUnitIcon(unit: BaseUnit): IconName {
  return unit === 'ml' ? 'liquid' : unit === 'piece' ? 'piece' : 'weigh'
}

/** The server's limit on a Shelf Life (ingredient.MaxShelfLifeDays). */
export const MAX_SHELF_LIFE_DAYS = 3650

export interface NewIngredientForm {
  name: string
  baseUnit: BaseUnit
  /** As typed: blank = none. */
  shelfLife: string
}

export type NewIngredientErrors = { name?: string; shelfLife?: string }

/**
 * Validates the sheet on submit. name: blank after trim -> strings.sheet.nameRequired. shelfLife: blank is fine (omitted from the body);
 * otherwise a whole number from 1 to 3650, else strings.sheet.shelfLifeInvalid. On success the body has the trimmed name, the Base Unit and,
 * only when given, shelfLifeDays.
 */
export function checkNewIngredient(form: NewIngredientForm): { ok: true; value: NewIngredient } | { ok: false; errors: NewIngredientErrors } {
  const name = form.name.trim().split(/\s+/).filter(Boolean).join(' ')
  const errors: NewIngredientErrors = {}
  if (name === '') errors.name = strings.sheet.nameRequired
  const shelf = form.shelfLife.trim()
  let shelfLifeDays: number | undefined
  if (shelf !== '') {
    if (/^\d+$/.test(shelf) && Number(shelf) >= 1 && Number(shelf) <= MAX_SHELF_LIFE_DAYS) shelfLifeDays = Number(shelf)
    else errors.shelfLife = strings.sheet.shelfLifeInvalid
  }
  if (errors.name || errors.shelfLife) return { ok: false, errors }
  return { ok: true, value: shelfLifeDays === undefined ? { name, baseUnit: form.baseUnit } : { name, baseUnit: form.baseUnit, shelfLifeDays } }
}

/** What the sheet does after the near-duplicate lookup of the typed name (the same matcher as Import Review: GET /api/ingredients/search). */
export type DuplicateGuard =
  | { kind: 'clear' }
  | { kind: 'exists'; ingredient: Ingredient }
  | { kind: 'similar'; suggestions: Suggestion[] }

/** exact match -> 'exists'; else any suggestions -> 'similar' (as sent, best first); else 'clear'. */
export function duplicateGuard(result: SearchResult): DuplicateGuard {
  if (result.exact) return { kind: 'exists', ingredient: result.exact }
  if (result.suggestions.length > 0) return { kind: 'similar', suggestions: result.suggestions }
  return { kind: 'clear' }
}

/** H5: the New Ingredient sheet's form, for either kind. A Supply has a Restock level and no Shelf Life (decision D3). */
export interface KindIngredientForm extends NewIngredientForm {
  kind: IngredientKind
  /** As typed: blank = none. */
  restock: string
}

export type KindIngredientErrors = NewIngredientErrors & { restock?: string }

/**
 * Validates the sheet for its kind and builds the body: food is checkNewIngredient plus kind 'food'; a Supply has the name, the Base Unit,
 * kind 'supply' and restockLevel when one is typed (never a shelfLifeDays, whatever was typed before switching).
 */
export function checkKindIngredient(form: KindIngredientForm): { ok: true; value: NewIngredient } | { ok: false; errors: KindIngredientErrors } {
  if (form.kind === 'food') {
    const checked = checkNewIngredient(form)
    return checked.ok ? { ok: true, value: { ...checked.value, kind: 'food' } } : checked
  }
  const named = checkNewIngredient({ name: form.name, baseUnit: form.baseUnit, shelfLife: '' })
  const restock = parseRestockText(form.restock)
  if (!named.ok || !restock.ok) {
    return {
      ok: false,
      errors: {
        // The only name error is a blank name, worded for a Supply.
        ...(named.ok ? {} : { name: strings.supply.nameRequired }),
        ...(restock.ok ? {} : { restock: restock.error }),
      },
    }
  }
  const { name, baseUnit } = named.value
  return { ok: true, value: restock.value === null ? { name, baseUnit, kind: 'supply' } : { name, baseUnit, kind: 'supply', restockLevel: restock.value } }
}

/** Switching the kind in the sheet: a Supply starts on piece; going back to food keeps the Base Unit the User chose. */
export function baseUnitAfterKindChange(next: IngredientKind, current: BaseUnit): BaseUnit {
  return next === 'supply' ? 'piece' : current
}
