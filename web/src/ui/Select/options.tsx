import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { RecipeThumb } from '../RecipeThumb'
import { Thumb } from '../Thumb'
import { mealSlotIcon } from '../lib/mealSlotIcon'
import type { SelectOption } from './lib'
import { selectStrings } from './strings'

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
  /** Absent for a not-yet-saved Ingredient; then `key` identifies it. */
  id?: number
  /** Temporary key of a not-yet-saved Ingredient (WP3b follow-up). */
  key?: string
  name: string
  baseUnit: string
  /** PE: the Ingredient's Picture address; the option draws a Thumb (an empty slot without it). */
  imageUrl?: string
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
  /** @deprecated use photoUrl (kept so older callers compile). */
  imageUrl?: string
  /** PE: the Member's Photo address, then `avatar` (emoji), then the initials. */
  photoUrl?: string
  avatar?: string
  /** PE: the Member colour, "#rrggbb" (the Avatar's ring). */
  colour?: string
}

export const ENGLISH_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** meta "35 min"; keywords = tags; leading = RecipeThumb. */
export function recipeOptions(recipes: RecipeChoice[]): SelectOption<number>[] {
  return recipes.map((r) => ({
    value: r.id,
    label: r.name,
    meta: r.totalMinutes !== undefined ? `${r.totalMinutes} min` : undefined,
    keywords: r.tags,
    leading: <RecipeThumb name={r.name} photoUrl={r.imageUrl} tags={r.tags} size={40} initial={false} />,
  }))
}

/** Value = id, or the temporary key of a not-yet-saved Ingredient; meta = the Base Unit (once, no badge). */
export function ingredientOptions(ingredients: IngredientChoice[]): SelectOption<number | string>[] {
  return ingredients.map((i) => ({
    value: (i.id ?? i.key)!,
    label: i.name,
    meta: selectStrings.baseUnitMeta(i.baseUnit),
    leading: <Thumb imageUrl={i.imageUrl} size={40} />,
  }))
}

/** Groups "Base Unit", "Unit Conversions" (meta "1 clove = 5 g"), "Units"; a unit never repeats across groups. */
export function unitOptions(units: UnitChoices): SelectOption<string>[] {
  const out: SelectOption<string>[] = [{ value: units.baseUnit, label: units.baseUnit, group: 'Base Unit' }]
  const seen = new Set<string>([units.baseUnit])
  for (const c of units.conversions) {
    if (seen.has(c.unit)) continue
    seen.add(c.unit)
    out.push({ value: c.unit, label: c.unit, meta: `1 ${c.unit} = ${c.toBase} ${units.baseUnit}`, group: 'Unit Conversions' })
  }
  for (const unit of units.globalUnits) {
    if (seen.has(unit)) continue
    seen.add(unit)
    out.push({ value: unit, label: unit, group: 'Units' })
  }
  return out
}

/** Input order; leading = Storefront icon. */
export function shopOptions(shops: ShopChoice[]): SelectOption<number>[] {
  return shops.map((s) => ({ value: s.id, label: s.name, leading: <Icon name="shops" size={20} /> }))
}

/** Grouped by weekday name, ordered by weekday then time; label = name, meta = time; leading = slot icon. */
export function mealSlotOptions(slots: MealSlotChoice[], weekdayNames: string[] = ENGLISH_WEEKDAYS): SelectOption<number>[] {
  const ordered = [...slots].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))
  return ordered.map((s) => ({
    value: s.id,
    label: s.name,
    triggerLabel: `${(weekdayNames[s.weekday - 1] ?? String(s.weekday)).slice(0, 3)} · ${s.name}`,
    meta: s.time,
    group: weekdayNames[s.weekday - 1] ?? String(s.weekday),
    leading: <Icon name={mealSlotIcon(s.name)} size={20} />,
  }))
}

/** leading = Avatar. */
export function memberOptions(members: MemberChoice[]): SelectOption<number>[] {
  return members.map((m) => ({
    value: m.id,
    label: m.name,
    leading: <Avatar name={m.name} imageUrl={m.photoUrl ?? m.imageUrl} glyph={m.avatar} colour={m.colour} size="sm" />,
  }))
}
