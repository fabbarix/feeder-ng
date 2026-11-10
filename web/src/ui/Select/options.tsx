import type { SelectOption } from './lib'

export interface RecipeChoice {
  id: number
  name: string
  imageUrl?: string
  tags: string[]
  totalMinutes?: number
  /** ISO date of the last Cooked Meal, if any. */
  lastCookedAt?: string | null
}
export interface IngredientChoice {
  id: number
  name: string
  baseUnit: string
}
export interface UnitChoices {
  baseUnit: string
  conversions: { unit: string; toBase: number }[]
  globalUnits: string[]
}
export interface ShopChoice {
  id: number
  name: string
}
export interface MealSlotChoice {
  id: number
  /** ISO weekday: 1 Monday .. 7 Sunday. */
  weekday: number
  name: string
  /** "HH:mm". */
  time: string
}
export interface MemberChoice {
  id: number
  name: string
  imageUrl?: string
}

export const ENGLISH_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** meta "35 min"; keywords = tags; leading = RecipeThumb. */
export function recipeOptions(_recipes: RecipeChoice[]): SelectOption<number>[] {
  throw new Error('not implemented')
}
/** leading = Base Unit badge, meta "Base Unit: g". */
export function ingredientOptions(_ingredients: IngredientChoice[]): SelectOption<number>[] {
  throw new Error('not implemented')
}
/** Groups "Base Unit", "Unit Conversions" (meta "1 clove = 5 g"), "Units"; a unit never repeats across groups. */
export function unitOptions(_units: UnitChoices): SelectOption<string>[] {
  throw new Error('not implemented')
}
/** Input order; leading = Storefront icon. */
export function shopOptions(_shops: ShopChoice[]): SelectOption<number>[] {
  throw new Error('not implemented')
}
/** Grouped by weekday name, ordered by weekday then time; label = name, meta = time; leading = slot icon. */
export function mealSlotOptions(_slots: MealSlotChoice[], _weekdayNames?: string[]): SelectOption<number>[] {
  throw new Error('not implemented')
}
/** leading = Avatar. */
export function memberOptions(_members: MemberChoice[]): SelectOption<number>[] {
  throw new Error('not implemented')
}
