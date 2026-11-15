import type { ShortfallGroup } from '../../stock/lib/shortfall'
import type { CookedAllResult, CookedResult, PlanSlot, SlotDayKey, StockWarning } from '../types'
import { planStrings as s } from '../strings'
import { weekdayName } from './phrase'

export const LEFTOVER_STEP = 0.5

/** The ± control: moves value by direction x step, clamped to [0, max]. */
export function adjustLeftover(value: number, direction: 1 | -1, max: number, step: number = LEFTOVER_STEP): number {
  return Math.min(max, Math.max(0, value + direction * step))
}

/** "1 portion", "1.5 portions", "2 portions", "0 portions". */
export function formatPortions(n: number): string {
  return n === 1 ? '1 portion' : `${n} portions`
}

/** Where the Leftover of a Cooked meal went (R4 B13). */
export type LeftoverOutcome =
  | { kind: 'none' }
  | { kind: 'kept'; portions: number; useBy: string }
  | { kind: 'planned'; portions: number; useBy: string; meals: { date: string; mealSlotName: string; recipeName: string }[] }

/** none: no Leftover recorded; planned: at least one later meal is served from it; kept: recorded and planned for nothing. */
export function leftoverOutcome(result: CookedResult): LeftoverOutcome {
  const left = result.leftover
  if (!left) return { kind: 'none' }
  if (result.plannedFor.length === 0) return { kind: 'kept', portions: left.portions, useBy: left.useBy }
  return {
    kind: 'planned',
    portions: left.portions,
    useBy: left.useBy,
    meals: result.plannedFor.map((m) => ({ date: m.date, mealSlotName: m.mealSlotName, recipeName: m.recipeName })),
  }
}

/**
 * The sentence the confirmation shows (short weekday names, the Meal Slot name as stored):
 * none: "No Leftovers";
 * kept: "1 portion kept, good until Thu";
 * planned: "2 portions planned for Tue Dinner" (several meals: "... for Tue Dinner and Wed Dinner").
 */
export function leftoverOutcomeText(outcome: LeftoverOutcome): string {
  switch (outcome.kind) {
    case 'none':
      return 'No Leftovers'
    case 'kept':
      return `${formatPortions(outcome.portions)} kept, good until ${weekdayName(outcome.useBy, 'short')}`
    case 'planned': {
      const meals = outcome.meals.map((m) => `${weekdayName(m.date, 'short')} ${m.mealSlotName}`).join(' and ')
      return `${formatPortions(outcome.portions)} planned for ${meals}`
    }
  }
}

/** The Cook Mode route of a Planned Meal: /cook/meal/<date>/<mealSlotId>. */
export function cookPath(key: SlotDayKey): string {
  return `/cook/meal/${key.date}/${key.mealSlotId}`
}

/** The part of the success toast that says where one Leftover went: "2 portions → Thu Lunch", "1 portion kept, good until Fri". */
function successPart(outcome: LeftoverOutcome): string {
  if (outcome.kind === 'planned') {
    const meals = outcome.meals.map((m) => `${weekdayName(m.date, 'short')} ${m.mealSlotName}`).join(' and ')
    return `${formatPortions(outcome.portions)} → ${meals}`
  }
  return leftoverOutcomeText(outcome)
}

/**
 * The success toast after Cooked: "Cooked, nice one!" plus where the Leftover went: "... 2 portions → Tue Dinner"
 * (planned), "... 1 portion kept, good until Thu" (kept), nothing more when there is no Leftover.
 */
export function cookedSuccessText(result: CookedResult): string {
  const outcome = leftoverOutcome(result)
  if (outcome.kind === 'none') return s.cookedCheer
  return `${s.cookedCheer} ${successPart(outcome)}`
}

/**
 * One outcome per Leftover recorded by Mark all Cooked, in order. The meals planned for a Leftover are those whose
 * courseId is the Leftover's fromCourseId; with exactly one Leftover every planned meal is its own (also without a
 * courseId). A Leftover with no meal planned for it is kept.
 */
export function cookedAllOutcomes(result: CookedAllResult): LeftoverOutcome[] {
  const single = result.leftovers.length === 1
  return result.leftovers.map((left) => {
    const planned = result.plannedFor.filter((m) => single || m.courseId === left.fromCourseId)
    if (planned.length === 0) return { kind: 'kept', portions: left.portions, useBy: left.useBy }
    return {
      kind: 'planned',
      portions: left.portions,
      useBy: left.useBy,
      meals: planned.map((m) => ({ date: m.date, mealSlotName: m.mealSlotName, recipeName: m.recipeName })),
    }
  })
}

/**
 * The confirmation sentence of Mark all Cooked: "No Leftovers"; one Leftover: the single Course's sentence; several:
 * each named by its Recipe, "Roast chicken: 2 portions planned for Thu Lunch. Green beans: 1 portion kept, good until Fri".
 */
export function cookedAllOutcomeText(result: CookedAllResult): string {
  const outcomes = cookedAllOutcomes(result)
  if (outcomes.length === 0) return 'No Leftovers'
  if (outcomes.length === 1) return leftoverOutcomeText(outcomes[0]!)
  return outcomes.map((o, i) => `${result.leftovers[i]!.recipeName}: ${leftoverOutcomeText(o)}`).join('. ')
}

/**
 * The success toast of Mark all Cooked: the cheer alone with no Leftover; one Leftover reads exactly as the single
 * Course's toast; several: "Cooked, nice one! Roast chicken: 2 portions → Thu Lunch; Green beans: 1 portion kept, good until Fri".
 */
export function cookedAllSuccessText(result: CookedAllResult): string {
  const outcomes = cookedAllOutcomes(result)
  if (outcomes.length === 0) return s.cookedCheer
  if (outcomes.length === 1) return `${s.cookedCheer} ${successPart(outcomes[0]!)}`
  const parts = outcomes.map((o, i) => `${result.leftovers[i]!.recipeName}: ${successPart(o)}`)
  return `${s.cookedCheer} ${parts.join('; ')}`
}

// ---- B9-45 (PC-02): the Cooked confirmation's Leftover tile, the shortfall groups and the entry link with its origin. ----

/** The "Where the Leftover went" tile of Cook Mode's Cooked confirmation: "1.25 portions kept" / "Planned for Mon Dinner · Use by Tue". */
export interface LeftoverTile {
  title: string
  meta: string
}

/** null when no Leftover was recorded (the confirmation shows no tile then). */
export function leftoverTile(outcome: LeftoverOutcome): LeftoverTile | null {
  if (outcome.kind === 'none') return null
  const title = `${formatPortions(outcome.portions)} kept`
  const useBy = `Use by ${weekdayName(outcome.useBy, 'short')}`
  if (outcome.kind === 'kept') return { title, meta: useBy }
  const meals = outcome.meals.map((m) => `${weekdayName(m.date, 'short')} ${m.mealSlotName}`).join(' and ')
  return { title, meta: `Planned for ${meals} · ${useBy}` }
}

/** The Cook Mode route and state of a Planned Meal opened from `from` (a path such as "/plan"): `{ to: "/cook/meal/<date>/<slot>", state: { from } }`. */
export function cookLinkFor(key: SlotDayKey, from: string): { to: string; state: { from: string } } {
  return { to: cookPath(key), state: { from } }
}

/** "Sat Dinner": the slot's weekday and name as the plan holds it (the weekday alone when the slot is not in the plan). */
export function slotDayLabel(slots: PlanSlot[], key: SlotDayKey): string {
  const slot = slots.find((x) => x.date === key.date && x.mealSlotId === key.mealSlotId)
  const day = weekdayName(key.date, 'short')
  return slot ? `${day} ${slot.name}` : day
}

/** One Cooked meal's group of the ONE shortfall notice; null when nothing was short. `key.courseId` absent: a Mark all of the slot. */
export function shortfallGroupFor(slots: PlanSlot[], key: SlotDayKey & { courseId?: number }, recipeName: string | null, warnings: StockWarning[]): ShortfallGroup | null {
  if (warnings.length === 0) return null
  const id = key.courseId === undefined ? `${key.date}/${key.mealSlotId}` : `${key.date}/${key.mealSlotId}/${key.courseId}`
  return { id, mealLabel: slotDayLabel(slots, key), recipeName: recipeName || null, warnings }
}

/** The Recipe of a Mark all Cooked for the notice: the one Course's Recipe, null when several Courses were cooked. */
export function cookedAllRecipe(result: CookedAllResult): string | null {
  return result.meals.length === 1 ? result.meals[0]!.recipeName || null : null
}

/** Adds a group to the notice's list (the same meal again replaces its group), newest last. */
export function withGroup(groups: ShortfallGroup[], group: ShortfallGroup | null): ShortfallGroup[] {
  if (!group) return groups
  return [...groups.filter((g) => g.id !== group.id), group]
}
