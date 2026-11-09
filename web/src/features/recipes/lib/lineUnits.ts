import { formatQuantity, type UnitSystem } from '../../../lib/units'
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

/**
 * How many Base Units one `unit` of the Ingredient is, or null when it cannot be converted. An
 * Ingredient's own Unit Conversion wins over a global unit of the same name.
 */
export function baseFactor(unit: string, ingredient: IngredientRef): number | null {
  const u = norm(unit)
  const own = ingredient.conversions.find((c) => norm(c.unit) === u)
  if (own) return own.toBase
  return GLOBAL_UNITS[ingredient.baseUnit][u] ?? null
}

const trimNumber = (n: number) => String(Number(n.toFixed(2)))

/**
 * A line's quantity in the User's display system. Metric shows the unit as typed (the Base Unit is
 * formatted by formatQuantity). Imperial converts to the Base Unit and formats it, so "250 g" reads
 * "8.8 oz". Without the Ingredient (not loaded yet) or without a conversion, the unit is shown as typed.
 */
export function quantityText(quantity: number, unit: string, ingredient: IngredientRef | undefined, system: UnitSystem): string {
  const asTyped = `${trimNumber(quantity)} ${unit}`
  if (!ingredient) return asTyped
  const base = ingredient.baseUnit
  if (system === 'metric') {
    return norm(unit) === base ? formatQuantity(quantity, base, 'metric') : asTyped
  }
  const factor = baseFactor(unit, ingredient)
  return factor === null ? asTyped : formatQuantity(quantity * factor, base, 'imperial')
}
