// B9-26 (PC-01): what a plan write changed beyond its own target: the toast words, the Review model and the marks on the changed
// rows. Plain TypeScript, no React.
import { undoStrings as u } from '../strings/undo'
import type { PlanSlot, SlotKey, Why } from '../types'
import type { IconName } from '../../../ui/icons'
import { dayNumber, phraseWhy, weekdayName } from './phrase'
import { WHY_ICON } from './rowChips'

/** One side of a change (null: the cell is empty on that side). */
export interface CellState {
  recipeId: number
  recipeName: string
  servedFromLeftover: boolean
}

/** One cell a write changed beyond its target (B9-11: `changes[]` of every replanning write and of the plan event). */
export interface PlanChange {
  date: string
  mealSlotId: number
  courseId: number
  before: CellState | null
  after: CellState | null
  why: Why[]
}

/** B9-46: 'away' is an Away write (its own toast; only Review's words use the kind). */
export type ReplanKind = 'swap' | 'choose' | 'pin' | 'unpin' | 'regenerate' | 'away'

/** Who made a write, as the plan event names them. */
export interface PlanActor {
  userId: number
  name: string
}

/** The words of the toast "What changed". `review` false: the toast has no Review button. */
export interface ReplanToast {
  headline: string
  subline?: string
  body?: string
  review: boolean
  /** "Review 2 changed meals"; absent without Review. */
  reviewAriaLabel?: string
  /** "Undo the Swap and 2 other changes". */
  undoAriaLabel: string
}

export interface ReviewRow {
  /** The new Recipe ("Nothing planned" when the cell is now empty). */
  key: string
  /** "Lunch · Main · was Lentil soup". */
  detail: string
  /** The detail's parts as the sheet draws them (the mock): "Lunch · Main", then "was Lentil soup" with its glyph. */
  place: string
  was: string
  /** The first why chip, phrased ("uses Lentils by Thu"); absent without one. */
  why?: string
  /** The glyph of that why chip, as on the Plan's rows. */
  whyIcon?: IconName
  cell: SlotKey
}

export interface ReviewDay {
  date: string
  /** "Tue 17". */
  heading: string
  rows: ReviewRow[]
}

export interface ReviewModel {
  title: string
  /** "After your Swap · 2 other meals". */
  context: string
  lede: string
  days: ReviewDay[]
}

/** The query-cache key under which the last write's changes are shared between the hooks and the screen. */
export const REPLAN_QUERY_KEY = ['planChanges'] as const

/** How many changes the toast body names before "And N more.". */
const LISTED = 3

const sameCell = (a: { date: string; mealSlotId: number }, b: { date: string; mealSlotId: number }) => a.date === b.date && a.mealSlotId === b.mealSlotId

/** The slot and the Course of a key in the given slots; the first slot of that date and Meal Slot that knows the Course wins. */
function find(slots: PlanSlot[], key: SlotKey) {
  // A day the given slots do not hold still names its Meal Slot from another date of the same Meal Slot (its ids are per weekday).
  const onDate = slots.filter((s) => sameCell(s, key))
  const matching = onDate.length > 0 ? onDate : slots.filter((s) => s.mealSlotId === key.mealSlotId)
  for (const slot of matching) {
    const index = (slot.courses ?? []).findIndex((c) => c.courseId === key.courseId)
    if (index >= 0) return { slot, course: slot.courses![index]!, index }
  }
  return matching[0] ? { slot: matching[0], course: undefined, index: -1 } : null
}

/**
 * "Tue Breakfast"; "Tue Dinner, Side" for a Course that is not the Main one; just "Tue" when the slot is not in `slots`.
 * The hooks pass the slots of the cached plan view followed by the cached To confirm entries (a day the view no longer holds).
 */
export function mealLabel(slots: PlanSlot[], key: SlotKey): string {
  const weekday = weekdayName(key.date, 'short')
  const found = find(slots, key)
  if (!found) return weekday
  const label = u.slotLabel(weekday, found.slot.name)
  return found.course && !found.course.main ? u.courseLabel(label, found.course.name) : label
}

/** "Tue Lunch is now Chicken curry. Wed Dinner is now Lentil soup. And 4 more." */
function changesBody(changes: PlanChange[], slots: PlanSlot[]): string {
  const listed = changes.slice(0, LISTED).map((c) => {
    const label = mealLabel(slots, c)
    if (!c.after) return u.isNowEmpty(label)
    return c.after.servedFromLeftover ? u.isNowLeftover(label, c.after.recipeName) : u.isNow(label, c.after.recipeName)
  })
  if (changes.length > LISTED) listed.push(u.andMore(changes.length - LISTED))
  return listed.join(' ')
}

/**
 * The toast after a write of the signed-in User; null when it has nothing to say (Pin or Unpin that changed nothing else).
 * `target` is the edited Planned Meal (Regenerate has none).
 */
export function replanToast(src: { kind: Exclude<ReplanKind, 'away'>; target?: SlotKey; changes: PlanChange[]; slots: PlanSlot[]; changed?: number }): ReplanToast | null {
  const { kind, target, changes, slots } = src
  const edit = u.editNoun[kind]
  if (kind === 'regenerate') {
    const changed = src.changed ?? changes.length
    return { headline: changed === 0 ? u.regeneratedNothing : u.regenerated(changed), review: false, undoAriaLabel: u.undoEdit(edit) }
  }
  const n = changes.length
  if (n === 0) {
    if (kind === 'pin' || kind === 'unpin') return null
    return { headline: kind === 'swap' ? u.swapped : u.chosen, review: false, undoAriaLabel: u.undoEdit(edit) }
  }
  const headline = target
    ? { swap: u.swappedMeal, choose: u.chosenFor, pin: u.pinnedMeal, unpin: u.unpinnedMeal }[kind](mealLabel(slots, target))
    : { swap: u.swapped, choose: u.chosen, pin: u.pinned, unpin: u.unpinned }[kind]
  return {
    headline,
    subline: u.otherMealsChanged(n),
    body: changesBody(changes, slots),
    review: true,
    reviewAriaLabel: u.reviewAria(n),
    undoAriaLabel: u.undoEditAndOthers(edit, n),
  }
}

/** The toast for another User's write (the plan event); null without a changed cell. Review only: there is no Undo. */
export function otherUserToast(ev: { reason?: string; by: PlanActor; target?: SlotKey; changes: PlanChange[]; slots: PlanSlot[] }): ReplanToast | null {
  const n = ev.changes.length
  if (n === 0) return null
  const name = ev.by.name
  let headline: string
  if (ev.reason === 'regenerate') headline = u.otherRegenerated(name)
  else if (ev.target && ev.reason === 'unpinned') headline = u.otherUnpinned(name, mealLabel(ev.slots, ev.target))
  else if (ev.target && ev.reason === 'pinned') headline = u.otherChanged(name, mealLabel(ev.slots, ev.target))
  else headline = u.otherChangedPlan(name)
  return { headline, subline: u.otherMealsChanged(n), body: changesBody(ev.changes, ev.slots), review: true, reviewAriaLabel: u.reviewAria(n), undoAriaLabel: '' }
}

/** Where a changed cell sorts within its day: the slot's time, then the Course's place in the slot. */
function orderOf(slots: PlanSlot[], c: PlanChange): [string, number, number] {
  const found = find(slots, c)
  return [found?.slot.time ?? '99:99', c.mealSlotId, found && found.index >= 0 ? found.index : 1000 + c.courseId]
}

function compare(a: [string, number, number], b: [string, number, number]): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1
  return a[1] - b[1] || a[2] - b[2]
}

/** The first why chip that has words, with its glyph. */
function firstWhy(why: Why[], date: string): { text: string; icon: IconName } | undefined {
  for (const w of why) {
    const text = phraseWhy(w, { slotDate: date })
    if (text) return { text, icon: WHY_ICON[w.code] ?? 'why' }
  }
  return undefined
}

function reviewRow(slots: PlanSlot[], c: PlanChange): ReviewRow {
  const found = find(slots, c)
  const was = c.before ? u.was(c.before.recipeName) : u.wasNotPlanned
  const place = [found?.slot.name, found?.course?.name].filter((p): p is string => Boolean(p)).join(' · ')
  const detail = place ? `${place} · ${was}` : was
  const why = firstWhy(c.why, c.date)
  const row: ReviewRow = { key: c.after?.recipeName ?? u.nothingPlanned, detail, place, was, cell: { date: c.date, mealSlotId: c.mealSlotId, courseId: c.courseId } }
  if (why) {
    row.why = why.text
    row.whyIcon = why.icon
  }
  return row
}

/** The sheet "What changed": grouped by day, the cells in day, slot-time and Course order. */
export function reviewModel(src: { kind?: ReplanKind; by?: PlanActor; target?: SlotKey; changes: PlanChange[]; slots: PlanSlot[] }): ReviewModel {
  const { changes, slots, target } = src
  const n = changes.length
  const label = target && src.kind !== 'regenerate' ? mealLabel(slots, target) : null
  const own = !src.by
  const edit = u.editName[src.kind ?? 'swap']
  const dates = [...new Set(changes.map((c) => c.date))].sort()
  const days = dates.map((date) => ({
    date,
    heading: u.dayHeading(weekdayName(date, 'short'), new Date(dayNumber(date) * 86_400_000).getUTCDate()),
    rows: changes
      .filter((c) => c.date === date)
      .sort((a, b) => compare(orderOf(slots, a), orderOf(slots, b)))
      .map((c) => reviewRow(slots, c)),
  }))
  return {
    title: u.reviewTitle,
    context: own ? u.contextOwn(edit, n) : u.contextOther(src.by!.name, n),
    lede: own ? u.ledeOwn(edit, label, n) : u.ledeOther(src.by!.name, label, n),
    days,
  }
}

/** "date/slot/course": the key of a row's mark. */
export function markKey(key: SlotKey): string {
  return `${key.date}/${key.mealSlotId}/${key.courseId}`
}

/** The "was ..." text of every changed cell by `markKey` ("was Lentil soup", "was not planned"). */
export function changedMarks(changes: PlanChange[]): Record<string, string> {
  const marks: Record<string, string> = {}
  for (const c of changes) marks[markKey(c)] = c.before ? u.was(c.before.recipeName) : u.wasNotPlanned
  return marks
}
