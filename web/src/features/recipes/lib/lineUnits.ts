import { formatLineQuantity, formatQuantity, type UnitSystem } from '../../../lib/units'
import type { BaseUnit, IngredientRef } from '../types'

/**
 * Global units per Base Unit, in the order the picker lists them. Mirrors internal/units (Go):
 * kg only for g; l, dl, cl, tsp, tbsp, cup only for ml; piece has none. The server has the last word.
 */
const GLOBAL_UNITS: Record<BaseUnit, Record<string, number>> = {
  g: { g: 1, kg: 1000 },
  ml: { ml: 1, l: 1000, dl: 100, cl: 10, tsp: 5, tbsp: 15, cup: 240 },
  piece: { piece: 1 },
}

const norm = (unit: string) => unit.trim().toLowerCase()

/**
 * Units usable for an ingredient line, for the editor's unit picker and instant feedback.
 * Mirrors docs/spec/recipe-file.md (Units): the Base Unit, the global units of that Base Unit
 * (g: kg; ml: l, dl, cl, tsp, tbsp, cup; piece: none) and the Ingredient's own Unit Conversions.
 * The server (internal/units) has the last word.
 */
export function selectableUnits(ingredient: IngredientRef): string[] {
  const out: string[] = []
  const add = (u: string) => {
    if (!out.includes(u)) out.push(u)
  }
  add(ingredient.baseUnit)
  for (const u of Object.keys(GLOBAL_UNITS[ingredient.baseUnit])) add(u)
  for (const c of ingredient.conversions) add(norm(c.unit))
  return out
}

/** True when `unit` (trimmed, case-insensitive) is one of selectableUnits. */
export function isKnownUnit(unit: string, ingredient: IngredientRef): boolean {
  const u = norm(unit)
  return u !== '' && selectableUnits(ingredient).includes(u)
}

const trimNumber = (n: number) => String(Number(n.toFixed(2)))

/**
 * A line's quantity in the User's display system. Without the Ingredient (not loaded yet) the use is shown
 * as typed. A use in the Ingredient's Base Unit is formatted as that Base Unit ("4 piece" reads "4 pieces").
 * Every other unit goes through lib/units formatLineQuantity: only metric mass and volume convert to imperial
 * ("250 g" reads "8.8 oz"); spoons, cups and Unit Conversions stay as written ("2 tbsp").
 */
export function quantityText(quantity: number, unit: string, ingredient: IngredientRef | undefined, system: UnitSystem): string {
  if (!ingredient) return `${trimNumber(quantity)} ${unit}`
  if (unit.trim().toLowerCase() === ingredient.baseUnit) return formatQuantity(quantity, ingredient.baseUnit, system)
  return formatLineQuantity(quantity, unit, system)
}

/** What `ui/UnitSelect` takes for an Ingredient: Base Unit, its Unit Conversions, and the remaining global units of its Base Unit. */
export interface UnitChoicesOf {
  baseUnit: BaseUnit
  conversions: { unit: string; toBase: number }[]
  globalUnits: string[]
}

/** selectableUnits split into the three UnitSelect groups: globalUnits excludes the Base Unit and every conversion unit. */
export function unitChoicesOf(ingredient: IngredientRef): UnitChoicesOf {
  const conversions = ingredient.conversions.map((c) => ({ unit: c.unit, toBase: c.toBase }))
  const taken = new Set<string>([ingredient.baseUnit, ...conversions.map((c) => norm(c.unit))])
  const globalUnits = Object.keys(GLOBAL_UNITS[ingredient.baseUnit]).filter((u) => !taken.has(u))
  return { baseUnit: ingredient.baseUnit, conversions, globalUnits }
}

/**
 * True when a line or Step use has a unit the Ingredient does not know yet (the User typed a custom one): the
 * server will answer 422 unknown_unit and the Unit Conversion prompt follows. False for blank units and while the Ingredient is unknown.
 */
export function needsConversion(unit: string, ingredient: IngredientRef | undefined): boolean {
  if (!ingredient || norm(unit) === '') return false
  return !isKnownUnit(unit, ingredient)
}
