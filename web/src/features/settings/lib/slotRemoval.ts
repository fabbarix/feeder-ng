// SAFE-02 (Remove Meal Slot): the words and rows of the confirm and of the toasts. Pure functions, no React.
import { ApiError } from '../../../lib/http'
import { weekdayLongName, weekdayShortName } from '../../../ui/WeekdayPicker/weekdays'
import { settingsStrings } from '../strings'
import { joinList } from './slotCourses'
import { weekdayOfDate } from './weekdays'

const text = settingsStrings.removal

/** One Planned Meal of the impact read (`GET /api/meal-slots/{id}/impact`). */
export interface ImpactMeal {
  date: string
  mealSlotId: number
  mealSlotName: string
  courseId: number
  courseName: string
  recipeId: number | null
  recipeName: string | null
  pinned: boolean
  bought: string[]
}
export interface ImpactRule {
  id: number
  mealSlotId: number
  mealSlotName: string
  courseId: number
  courseName: string
  recipeId?: number
  recipeName?: string
  tag?: string
}
export interface MealSlotImpact {
  plannedMeals: ImpactMeal[]
  slotRules: ImpactRule[]
  toConfirm: ImpactMeal[]
  cookedKept: number
}
/** The shape ConfirmOptions.groups takes (B9-18). */
export interface RemoveGroup {
  label: string
  rows: { key: string; state?: string; detail?: string }[]
}

type SlotDay = { name: string; weekday: number }

/** "Remove Dinner on Monday?" */
export function removeTitle(slot: SlotDay, locale = 'en'): string {
  return text.title(slot.name, weekdayLongName(slot.weekday, locale))
}
/** "Dinner stays on the other days."; none when the name runs on no other weekday. */
export function removeLead(name: string, otherDays: number): string | undefined {
  return otherDays > 0 ? text.lead(name) : undefined
}
/** The Undo toast's headline: "Dinner on Monday removed". */
export function removedHeadline(slot: SlotDay, locale = 'en'): string {
  return text.removed(slot.name, weekdayLongName(slot.weekday, locale))
}
/** After Undo: "Dinner on Monday is back". */
export function restoredHeadline(slot: SlotDay, locale = 'en'): string {
  return text.back(slot.name, weekdayLongName(slot.weekday, locale))
}
/** The Undo button's accessible name: "Undo: put back Dinner on Monday". */
export function undoRemoveLabel(slot: SlotDay, locale = 'en'): string {
  return text.undoLabel(slot.name, weekdayLongName(slot.weekday, locale))
}

/** "Mon 16": a date as the confirm rows word it. */
function dayLabel(date: string, locale: string): string {
  const weekday = weekdayOfDate(date)
  return `${weekday === null ? '' : weekdayShortName(weekday, locale)} ${Number(date.slice(8, 10))}`.trim()
}

function plannedDetail(dates: string[], today: string, locale: string): string {
  const sorted = [...new Set(dates)].sort()
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  if (first === last) return first === today ? text.today(dayLabel(first, locale)) : dayLabel(first, locale)
  return first <= today ? text.fromToday(dayLabel(first, locale), dayLabel(last, locale)) : text.from(dayLabel(first, locale), dayLabel(last, locale))
}

/** The Goes rows (Planned Meals, Slot Rule(s), To confirm), each left out when empty, then Stays (the Cooked history). */
export function removeGroups(impact: MealSlotImpact, opts: { today: string; locale?: string }): RemoveGroup[] {
  const locale = opts.locale ?? 'en'
  const goes: RemoveGroup['rows'] = []
  if (impact.plannedMeals.length > 0) {
    goes.push({ key: text.plannedMeals, state: String(impact.plannedMeals.length), detail: plannedDetail(impact.plannedMeals.map((m) => m.date), opts.today, locale) })
  }
  if (impact.slotRules.length > 0) {
    const many = impact.slotRules.length > 1
    const rules = impact.slotRules.map((r) => text.rule(r.mealSlotName, r.recipeName ?? r.tag ?? r.courseName))
    goes.push({ key: many ? text.slotRules : text.slotRule, state: String(impact.slotRules.length), detail: text.ruleStops(joinList(rules), many) })
  }
  if (impact.toConfirm.length > 0) {
    const seen = new Set<string>()
    const days: string[] = []
    for (const m of [...impact.toConfirm].sort((a, b) => a.date.localeCompare(b.date))) {
      const id = `${m.date}#${m.mealSlotId}`
      if (seen.has(id)) continue
      seen.add(id)
      const weekday = weekdayOfDate(m.date)
      days.push(`${weekday === null ? m.date : weekdayShortName(weekday, locale)} ${m.mealSlotName}`)
    }
    goes.push({ key: text.toConfirm, state: String(days.length), detail: days.join(', ') })
  }
  const stays: RemoveGroup = { label: text.stays, rows: [{ key: text.cookedHistory, state: text.kept, detail: text.keptDetail }] }
  return goes.length > 0 ? [{ label: text.goes, rows: goes }, stays] : [stays]
}

/**
 * A restore the server refused because the name is used on that day again (409 `meal_slot_name_taken`, B9-04): the server's sentence
 * ("There is already a Dinner on Monday.") as the subline and what to do as the body. Null for any other failure.
 */
export function nameTakenRefusal(error: unknown): { subline: string; body: string } | null {
  if (!(error instanceof ApiError) || error.code !== 'meal_slot_name_taken') return null
  return { subline: error.message, body: text.nameTaken }
}

/** The Put back refusal's headline: "Snack was not put back", or "Snack was put back on some days only" after a partial restore. */
export function putBackRefusedHeadline(name: string, restored: number): string {
  return restored > 0 ? text.putBackPartial(name) : text.putBackRefused(name)
}

/** How many other weekdays run a Meal Slot of this name (the confirm's lead says it stays there). */
export function otherDaysOf(slot: { id: number; name: string }, slots: readonly { id: number; name: string }[]): number {
  const key = slot.name.trim().toLowerCase()
  return slots.filter((s) => s.id !== slot.id && s.name.trim().toLowerCase() === key).length
}
