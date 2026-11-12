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
  | 'cool_down'
  | 'variety_rule'
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
const ORDER: Cause[] = ['nobody_attending', 'no_recipes', 'no_course_recipes', 'slot_rule', 'excluded', 'cool_down', 'variety_rule', 'advance_step', 'no_fit']

const META: Record<Cause, { tone: Tone; icon: IconName; fix: (label: string, group: PlanSlot[]) => FixAction }> = {
  // R15: deep link to the earliest affected Meal Slot (the group is sorted by date and time).
  nobody_attending: {
    tone: 'info',
    icon: 'attendance',
    fix: (label, group) => ({ kind: 'link', label, to: `/settings/meal-slots${group[0] ? slotHash(group[0].mealSlotId) : ''}` }),
  },
  no_recipes: { tone: 'info', icon: 'recipes', fix: (label) => ({ kind: 'link', label, to: '/recipes' }) },
  no_course_recipes: { tone: 'info', icon: 'recipes', fix: (label) => ({ kind: 'link', label, to: '/recipes' }) },
  slot_rule: { tone: 'warn', icon: 'slotRule', fix: (label) => ({ kind: 'link', label, to: '/settings/planning' }) },
  excluded: { tone: 'warn', icon: 'exclusion', fix: (label) => ({ kind: 'link', label, to: '/recipes' }) },
  cool_down: { tone: 'warn', icon: 'duration', fix: (label) => ({ kind: 'link', label, to: '/settings/household' }) },
  variety_rule: { tone: 'warn', icon: 'varietyRule', fix: (label) => ({ kind: 'link', label, to: '/settings/planning' }) },
  advance_step: { tone: 'warn', icon: 'advanceStep', fix: (label) => ({ kind: 'choose', label }) },
  no_fit: { tone: 'warn', icon: 'info', fix: (label) => ({ kind: 'choose', label }) },
}

/** Causes whose fix page (Meal Slots, Household settings) only an Admin can change; Slot and Variety Rules are open to every User. */
const ADMIN_ONLY = new Set<Cause>(['nobody_attending', 'cool_down'])

/** The tone of a cause. */
export function toneOf(cause: Cause): Tone {
  return META[cause].tone
}

/** The one cause a slot is filed under. */
export function causeOf(slot: Pick<PlanSlot, 'unfilled'>): Cause {
  const u = slot.unfilled
  if (!u) return 'no_fit'
  if (u.reason === 'no_attendance') return 'nobody_attending'
  if (u.slotRuleClaimed) return 'slot_rule'
  const e = u.eliminated
  if (e.considered === 0) return 'no_recipes'
  // The filter that removed the most options; ties go in this order.
  const filters: [Cause, number][] = [
    ['excluded', e.exclusion],
    ['cool_down', e.coolDown],
    ['variety_rule', e.varietyRule],
    ['advance_step', e.advanceStep],
  ]
  let best: Cause = 'no_fit'
  let most = 0
  for (const [cause, n] of filters) {
    if (n > most) {
      best = cause
      most = n
    }
  }
  return best
}

/** The slots the planner left empty with a recorded reason, in plan order. */
export function unplannedOf(slots: PlanSlot[]): PlanSlot[] {
  return slots.filter((x) => x.meal === null && x.unfilled !== null && x.unfilled !== undefined)
}

function byTime(a: PlanSlot, b: PlanSlot): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : a.time > b.time ? 1 : 0
}

/**
 * One group per cause, never one line per slot. CRS G2: `slots` are the cells (`unplannedOf`, or the API's flat entries);
 * `all` is the whole plan (slots with `courses`, or cells): it says how many Courses a slot has, which decides whether the
 * counts are of Meal Slots or of Courses and whether a line names its Course (`cellItems`).
 */
export function groupByCause(slots: PlanSlot[], _all: PlanSlot[] = slots): CauseGroup[] {
  const byCause = new Map<Cause, PlanSlot[]>()
  for (const slot of slots) {
    const c = causeOf(slot)
    byCause.set(c, [...(byCause.get(c) ?? []), slot])
  }
  return ORDER.filter((c) => byCause.has(c)).map((cause) => {
    const list = [...byCause.get(cause)!].sort(byTime)
    const count = list.length
    const meta = META[cause]
    const text = cause === 'slot_rule' ? (count === 1 ? s.couldntSlotRuleOne : s.couldntSlotRuleMany) : s.couldntCauseText[cause]
    return {
      cause,
      count,
      slots: list,
      items: [],
      headline: `${s.couldntCount(count)} ${text}`,
      hint: s.couldntHint[cause],
      tone: meta.tone,
      icon: meta.icon,
      fix: meta.fix(s.couldntFix[cause], list),
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
export function courseCells(_slots: PlanSlot[]): PlanSlot[] {
  throw new Error('CRS G2: not implemented')
}

/**
 * CRS G2: the lines of a group's "Show all": one per cell, "Fri 13 Nov · Dinner · Side" when only some of the slot's
 * Courses are in the group, one per slot ("Fri 13 Nov · Dinner") when every Course the slot has is. `all` says how many
 * Courses a slot has (its counting cells, `courseCells(all)`). A slot not in `all` has the cells given.
 */
export function cellItems(_cells: PlanSlot[], _all: PlanSlot[]): CauseItem[] {
  throw new Error('CRS G2: not implemented')
}
