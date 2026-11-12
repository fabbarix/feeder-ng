import type { IconName } from '../../../ui/icons'
import { slotHash } from '../../settings/lib/slotAnchor'
import { planStrings as s } from '../strings'
import type { PlanSlot } from '../types'
import { weekdayName } from './phrase'

export type Cause =
  | 'nobody_attending'
  | 'no_recipes'
  /** CRS G2: reason `no_course_recipes`. */
  | 'no_course_recipes'
  | 'slot_rule'
  | 'excluded'
  | 'advance_step'
  | 'no_fit'

/** info = setup is missing; warn = a rule conflict. Never danger: nothing is on fire. */
export type Tone = 'info' | 'warn'

export type FixAction = { kind: 'link'; label: string; to: string } | { kind: 'choose'; label: string }

/** CRS G2: one line of a tile's "Show all" list. */
export interface CauseItem {
  /** Unique within the group. */
  key: string
  /** "Tue 10 Nov · Dinner", or "Fri 13 Nov · Dinner · Side" when only some Courses of the slot are affected. */
  text: string
  /** "cell-<date>-<mealSlotId>-<courseId>" of the item's first cell: the id of the line on the Review Exclusions page. */
  id: string
  /** Set on the lines of the Excluded cause: `/plan/couldnt-plan/excluded#<id>`. */
  to?: string
}

export interface CauseGroup {
  cause: Cause
  /** The number in the headline: Meal Slots for Nobody attends, Courses otherwise. */
  count: number
  /** CRS G2: the cells (one per Course), in plan order; for a slot without Courses, the slot itself. */
  slots: PlanSlot[]
  /** CRS G2: the lines of "Show all N", N = items.length. */
  items: CauseItem[]
  /** "Couldn't plan 9 Meal Slots. Nobody is set to attend." */
  headline: string
  hint: string
  tone: Tone
  icon: IconName
  fix: FixAction
  /** The fix leads to a page only an Admin can change (Meal Slots, Household settings). */
  adminOnly: boolean
}

/** Display order: setup gaps first, then rule conflicts. */
const ORDER: Cause[] = ['nobody_attending', 'no_recipes', 'no_course_recipes', 'slot_rule', 'excluded', 'advance_step', 'no_fit']

/** Where a cause's fix goes; `first` is the earliest cell of the group. */
type FixFor = (label: string, first: PlanSlot | undefined) => FixAction

const META: Record<Cause, { tone: Tone; icon: IconName; fix: FixFor }> = {
  // R15: deep link to the earliest affected Meal Slot (the group is sorted by date and time).
  nobody_attending: {
    tone: 'info',
    icon: 'attendance',
    fix: (label, first) => ({ kind: 'link', label, to: `/settings/meal-slots${first ? slotHash(first.mealSlotId) : ''}` }),
  },
  no_recipes: { tone: 'info', icon: 'recipes', fix: (label) => ({ kind: 'link', label, to: '/recipes' }) },
  // CRS G2: the earliest cell's Course; no Course known (an old payload): the Recipes list.
  no_course_recipes: {
    tone: 'info',
    icon: 'recipes',
    fix: (label, first) =>
      first && first.courseId !== undefined && first.courseName
        ? { kind: 'link', label: s.markRecipesAs(first.courseName), to: `/recipes?notCourse=${first.courseId}` }
        : { kind: 'link', label, to: '/recipes' },
  },
  slot_rule: { tone: 'warn', icon: 'slotRule', fix: (label) => ({ kind: 'link', label, to: '/settings/planning' }) },
  // CRS G2: open to every User (preferences are not Admin-only), so never "Ask an Admin".
  excluded: { tone: 'warn', icon: 'exclusion', fix: (label) => ({ kind: 'link', label, to: '/plan/couldnt-plan/excluded' }) },
  advance_step: { tone: 'warn', icon: 'advanceStep', fix: (label) => ({ kind: 'choose', label }) },
  no_fit: { tone: 'warn', icon: 'info', fix: (label) => ({ kind: 'choose', label }) },
}

/** Causes whose fix page (Meal Slots) only an Admin can change; Slot Rules are open to every User. */
const ADMIN_ONLY = new Set<Cause>(['nobody_attending'])

/** The tone of a cause. */
export function toneOf(cause: Cause): Tone {
  return META[cause].tone
}

/** The one cause a slot (or a Course, or a cell) is filed under. */
export function causeOf(slot: Pick<PlanSlot, 'unfilled'>): Cause {
  const u = slot.unfilled
  if (!u) return 'no_fit'
  if (u.reason === 'no_attendance') return 'nobody_attending'
  if (u.reason === 'no_course_recipes') return 'no_course_recipes'
  if (u.slotRuleClaimed) return 'slot_rule'
  const e = u.eliminated
  if (e.considered === 0) return 'no_recipes'
  // The filter that removed the most options; a tie goes to Exclusion.
  if (e.exclusion > 0 && e.exclusion >= e.advanceStep) return 'excluded'
  if (e.advanceStep > 0) return 'advance_step'
  return 'no_fit'
}

/** The Course cells the planner left empty with a recorded reason, in plan order (`courseCells`). */
export function unplannedOf(slots: PlanSlot[]): PlanSlot[] {
  return courseCells(slots).filter((x) => x.meal === null && x.unfilled !== null && x.unfilled !== undefined)
}

function byTime(a: PlanSlot, b: PlanSlot): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : a.time > b.time ? 1 : 0
}

const slotKey = (x: PlanSlot): string => `${x.date}/${x.mealSlotId}`
const courseKey = (x: PlanSlot): number => x.courseId ?? -1

/** Plural of a name on its last word: "Side" -> "Sides", "Side dish" -> "Side dishes", "Dessert" -> "Desserts". */
export function pluralName(name: string): string {
  const words = name.split(' ')
  const last = words[words.length - 1] ?? ''
  const plural = /[^aeiou]y$/i.test(last) ? `${last.slice(0, -1)}ies` : /(s|ch|sh|x)$/i.test(last) ? `${last}es` : `${last}s`
  return [...words.slice(0, -1), plural].join(' ')
}

/** The headline's noun and number for one cause's cells. */
function countOf(cause: Cause, list: PlanSlot[], allCells: PlanSlot[]): { count: number; noun: string } {
  if (cause === 'nobody_attending') {
    const count = new Set(list.map(slotKey)).size
    return { count, noun: count === 1 ? 'Meal Slot' : 'Meal Slots' }
  }
  const count = list.length
  // A Meal Slot that serves one Course reads as a Meal Slot, as before Courses.
  const servesSeveral = list.some((x) => new Set(allCells.filter((y) => slotKey(y) === slotKey(x)).map(courseKey)).size > 1)
  if (!servesSeveral) return { count, noun: count === 1 ? 'Meal Slot' : 'Meal Slots' }
  const courses = new Set(list.map(courseKey))
  const name = list[0]!.courseName
  if (courses.size === 1 && name) return { count, noun: count === 1 ? name : pluralName(name) }
  return { count, noun: count === 1 ? 'Course' : 'Courses' }
}

/** CRS G2: the lines of "Show all", one per Meal Slot when every Course of the slot is in the group, else one per cell. */
export function cellItems(cells: PlanSlot[], all: PlanSlot[]): CauseItem[] {
  const allCells = courseCells(all)
  const items: CauseItem[] = []
  const done = new Set<string>()
  for (const cell of cells) {
    const k = slotKey(cell)
    const inGroup = new Set(cells.filter((x) => slotKey(x) === k).map(courseKey))
    const counted = new Set(allCells.filter((x) => slotKey(x) === k).map(courseKey))
    const everyCourse = counted.size > 0 ? [...counted].every((c) => inGroup.has(c)) : true
    if (everyCourse) {
      if (done.has(k)) continue
      done.add(k)
      const first = cells.find((x) => slotKey(x) === k)!
      items.push({ key: k, text: slotLine(first), id: cellId(first) })
    } else {
      items.push({ key: cellId(cell), text: cell.courseName ? `${slotLine(cell)} · ${cell.courseName}` : slotLine(cell), id: cellId(cell) })
    }
  }
  return items
}

function cellId(x: PlanSlot): string {
  return `cell-${x.date}-${x.mealSlotId}-${x.courseId ?? 0}`
}

/** The headline's text for one cause. */
function textOf(cause: Cause, list: PlanSlot[], count: number): string {
  if (cause === 'slot_rule') return count === 1 ? s.couldntSlotRuleOne : s.couldntSlotRuleMany
  if (cause === 'no_course_recipes') {
    const courses = new Set(list.map(courseKey))
    const name = list[0]!.courseName
    return courses.size === 1 && name ? s.couldntNoRecipesFor(name) : s.couldntCauseText.no_course_recipes
  }
  return s.couldntCauseText[cause]
}

/**
 * One group per cause, never one line per slot. CRS G2: `slots` are the cells (`unplannedOf`, or the API's flat entries);
 * `all` is the whole plan (slots with `courses`, or cells): it says how many Courses a slot has, which decides whether the
 * counts are of Meal Slots or of Courses and whether a line names its Course (`cellItems`).
 */
export function groupByCause(slots: PlanSlot[], all: PlanSlot[] = slots): CauseGroup[] {
  const byCause = new Map<Cause, PlanSlot[]>()
  for (const slot of slots) {
    const c = causeOf(slot)
    byCause.set(c, [...(byCause.get(c) ?? []), slot])
  }
  const allCells = courseCells(all)
  return ORDER.filter((c) => byCause.has(c)).map((cause) => {
    const list = [...byCause.get(cause)!].sort(byTime)
    const { count, noun } = countOf(cause, list, allCells)
    const meta = META[cause]
    const items = cellItems(list, all)
    return {
      cause,
      count,
      slots: list,
      items: cause === 'excluded' ? items.map((i) => ({ ...i, to: `/plan/couldnt-plan/excluded#${i.id}` })) : items,
      headline: `${s.couldntHeadline(count, noun)} ${textOf(cause, list, count)}`,
      hint: s.couldntHint[cause],
      tone: meta.tone,
      icon: meta.icon,
      fix: meta.fix(s.couldntFix[cause], list[0]),
      adminOnly: ADMIN_ONLY.has(cause),
    }
  })
}

/** The short reason on a day tile. */
export function shortReason(cause: Cause): string {
  return s.couldntShort[cause]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Tue 10 Nov · Dinner". */
export function slotLine(slot: PlanSlot): string {
  const [, m, d] = slot.date.split('-').map(Number)
  return `${weekdayName(slot.date, 'short')} ${d} ${MONTHS[(m ?? 1) - 1]} · ${slot.name}`
}

export interface ToneStyle {
  tile: { variant: 'status'; status: 'info' | 'spoil' }
  chip: { kind: 'status'; status: 'info' | 'spoil' }
}

/** Existing tokens only: info is the blue status tile and chip, warn the amber status. */
export function toneStyle(tone: Tone): ToneStyle {
  if (tone === 'info') return { tile: { variant: 'status', status: 'info' }, chip: { kind: 'status', status: 'info' } }
  return { tile: { variant: 'status', status: 'spoil' }, chip: { kind: 'status', status: 'spoil' } }
}

/**
 * CRS G2: every Course of every slot that holds a Planned Meal or a recorded reason, as flat cells in plan order (the
 * shape of the API's flat entries: the slot's fields plus `courseId`, `courseName`, `meal`, `unfilled`). Covered and
 * not-served Courses have neither and give no cell. An entry that already has a `courseId` is a cell and is kept as it is;
 * a slot without `courses` is one cell, itself.
 */
export function courseCells(slots: PlanSlot[]): PlanSlot[] {
  const out: PlanSlot[] = []
  for (const slot of slots) {
    if (slot.courseId !== undefined) {
      out.push(slot)
      continue
    }
    if (slot.courses === undefined) {
      if (slot.meal !== null || slot.unfilled !== null) out.push(slot)
      continue
    }
    for (const course of slot.courses) {
      if (course.meal === null && course.unfilled === null) continue
      out.push({ ...slot, courseId: course.courseId, courseName: course.name, meal: course.meal, unfilled: course.unfilled })
    }
  }
  return out
}
