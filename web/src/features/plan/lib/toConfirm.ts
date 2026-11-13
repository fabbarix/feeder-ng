// CRS F: To confirm groups a slot's Courses under one heading, and Mark all Cooked builds its body. Plain TypeScript.
import { planStrings as s } from '../strings'
import type { CookedAllEntry, CookPreview, PlanEntry, SlotDayKey, SlotKey } from '../types'
import { weekdayName } from './phrase'

export interface ToConfirmGroup {
  /** `{ date, mealSlotId }`: the slot, for Mark all Cooked. */
  slot: SlotDayKey
  /** One Course: the Recipe name as before. Several: "Tue Dinner: Roast chicken, Green beans". */
  heading: string
  /** The flat entries of the slot, in the order given. */
  entries: PlanEntry[]
}

/**
 * Groups the flat to-confirm entries (one per Course) by date and Meal Slot, keeping the order of first appearance.
 * A group with one entry has the Recipe name as heading and keeps the old "Tue Dinner" line; a group with several
 * entries has the heading "<Tue> <Dinner>: <Recipe>, <Recipe>" (short weekday, slot name, Recipe names in entry order).
 */
export function groupToConfirm(entries: PlanEntry[]): ToConfirmGroup[] {
  const groups = new Map<string, PlanEntry[]>()
  for (const entry of entries) {
    const key = `${entry.date}|${entry.mealSlotId}`
    const list = groups.get(key)
    if (list) list.push(entry)
    else groups.set(key, [entry])
  }
  return [...groups.values()].map((list) => {
    const first = list[0]!
    const names = list.map((e) => e.meal?.recipeName ?? '')
    const heading = list.length === 1 ? names[0]! : s.toConfirmSlotHeading(weekdayName(first.date, 'short'), first.name, names)
    return { slot: { date: first.date, mealSlotId: first.mealSlotId }, heading, entries: list }
  })
}

/** A fresh Course of the Mark all Cooked sheet, with its edited Leftover; a Leftover Course has `fresh: false`. */
export interface AllCookedRow {
  courseId: number
  courseName: string
  recipeName: string
  fresh: boolean
  proposedLeftover: number
  maxLeftover: number
  leftover: number
  leftoverUseBy: string
}

/**
 * The body of POST .../all/cooked: one `{ courseId, leftoverPortions }` per FRESH row, in row order, with the edited
 * Leftover; a Leftover Course (fresh false) is left out (it has no Leftover to record).
 */
export function allCookedBody(rows: AllCookedRow[]): CookedAllEntry[] {
  return rows.filter((r) => r.fresh).map((r) => ({ courseId: r.courseId, leftoverPortions: r.leftover }))
}

/**
 * The course ids of the to-confirm entries of one date and Meal Slot, in entry order: the Courses Mark all Cooked asks
 * about from Today. An entry without a courseId names no Course and is left out (crs-c3: never read as 0).
 */
export function toConfirmCourses(entries: PlanEntry[], key: SlotDayKey): number[] {
  return entries
    .filter((e) => e.date === key.date && e.mealSlotId === key.mealSlotId && e.courseId !== undefined)
    .map((e) => e.courseId)
}

/** One Course of a Meal Slot's To confirm row, besides the Main Recipe. */
export interface ToConfirmSide {
  courseName: string
  recipeName: string
}

/**
 * One row of To confirm: one Meal Slot on a date, never one per Course (docs/design/system.md §9, option A). The Main
 * Recipe, the other Courses as sides, and the one decision the row offers.
 */
export interface ToConfirmRow {
  slot: SlotDayKey
  /** The short weekday, "Wed". */
  dayLabel: string
  slotName: string
  /** The Main Recipe: the Course flagged main, else the first entry. */
  main: string
  /** The other Courses' Recipes in entry order; the same dish never appears twice. */
  sides: ToConfirmSide[]
  /** Every Course of the slot still to confirm, a Course without a Recipe included. */
  courseCount: number
  /** One Course: "Cooked". Several: "All Cooked" for the slot. */
  primary: 'cooked' | 'allCooked'
  /** The key of the one Course, when the slot has only one. */
  single?: SlotKey
}

const dishKey = (name: string): string => name.trim().toLowerCase()

/**
 * Folds the flat to-confirm entries (one per Course) into one row per Meal Slot and date, in the order of first
 * appearance. The Main Recipe is the Course flagged main (else the first entry); a side whose dish is already on the row is dropped.
 */
export function toConfirmRows(entries: PlanEntry[]): ToConfirmRow[] {
  const groups = new Map<string, PlanEntry[]>()
  for (const entry of entries) {
    const key = `${entry.date}|${entry.mealSlotId}`
    const list = groups.get(key)
    if (list) list.push(entry)
    else groups.set(key, [entry])
  }
  return [...groups.values()].map((list) => {
    const first = list[0]!
    const mainId = first.courses?.find((c) => c.main)?.courseId
    const main = list.find((e) => e.courseId === mainId) ?? first
    const seen = new Set<string>(main.meal ? [dishKey(main.meal.recipeName)] : [])
    const sides: ToConfirmSide[] = []
    for (const entry of list) {
      if (entry === main || !entry.meal) continue
      const k = dishKey(entry.meal.recipeName)
      if (seen.has(k)) continue
      seen.add(k)
      sides.push({ courseName: entry.courseName, recipeName: entry.meal.recipeName })
    }
    const row: ToConfirmRow = {
      slot: { date: first.date, mealSlotId: first.mealSlotId },
      dayLabel: weekdayName(first.date, 'short'),
      slotName: first.name,
      main: main.meal?.recipeName ?? '',
      sides,
      courseCount: list.length,
      primary: list.length > 1 ? 'allCooked' : 'cooked',
    }
    if (list.length === 1) row.single = { date: first.date, mealSlotId: first.mealSlotId, courseId: main.courseId }
    return row
  })
}

/** The line under the Main Recipe: "+ Side · Two-colour cauliflower", or "+ 2 more · Green beans, Tiramisu"; null with no sides. */
export function toConfirmSidesLine(row: ToConfirmRow): string | null {
  if (row.sides.length === 0) return null
  if (row.sides.length === 1) return `+ ${row.sides[0]!.courseName} · ${row.sides[0]!.recipeName}`
  return `+ ${row.sides.length} more · ${row.sides.map((s) => s.recipeName).join(', ')}`
}

/**
 * The Mark all Cooked rows of a one-tap "All Cooked": one per Course, from its preview (the planned Leftover is the
 * proposal, clamped to the most a Course can give). Pure: the flow fetches the previews and posts the result.
 */
export function previewRows(courseIds: number[], previews: CookPreview[]): AllCookedRow[] {
  return courseIds.map((courseId, i) => {
    const p = previews[i]!
    const leftover = p.fresh ? Math.min(Math.max(p.proposedLeftover, 0), p.maxLeftover) : 0
    return {
      courseId,
      courseName: p.meal.courseName ?? '',
      recipeName: p.meal.recipeName,
      fresh: p.fresh,
      proposedLeftover: p.proposedLeftover,
      maxLeftover: p.maxLeftover,
      leftover,
      leftoverUseBy: p.leftoverUseBy,
    }
  })
}
