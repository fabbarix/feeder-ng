// B9-26 (PC-01): what a plan write changed beyond its own target: the toast words, the Review model and the marks on the changed
// rows. Plain TypeScript, no React. TEST-AUTHOR STUB: the signatures the tests pin; the developer replaces every body.
import type { PlanSlot, SlotKey, Why } from '../types'

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

export type ReplanKind = 'swap' | 'choose' | 'pin' | 'unpin' | 'regenerate'

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
  /** The first why chip, phrased ("uses Lentils by Thu"); absent without one. */
  why?: string
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

const notBuilt = (): never => {
  throw new Error('B9-26: lib/replan.ts is not built yet')
}

/** The query-cache key under which the last write's changes are shared between the hooks and the screen. */
export const REPLAN_QUERY_KEY = ['planChanges'] as const

/**
 * "Tue Breakfast"; "Tue Dinner, Side" for a Course that is not the Main one; just "Tue" when the slot is not in `slots`.
 * The hooks pass the slots of the cached plan view followed by the cached To confirm entries (a day the view no longer holds).
 */
export function mealLabel(_slots: PlanSlot[], _key: SlotKey): string {
  return notBuilt()
}

/** The toast after a write of the signed-in User; null when it has nothing to say (Pin or Unpin that changed nothing else). */
export function replanToast(_src: { kind: ReplanKind; target: SlotKey; changes: PlanChange[]; slots: PlanSlot[]; changed?: number }): ReplanToast | null {
  return notBuilt()
}

/** The toast for another User's write (the plan event); null without a changed cell. Review only: there is no Undo. */
export function otherUserToast(_ev: { reason?: string; by: PlanActor; target?: SlotKey; changes: PlanChange[]; slots: PlanSlot[] }): ReplanToast | null {
  return notBuilt()
}

/** The sheet "What changed": grouped by day, the cells in day, slot-time and Course order. */
export function reviewModel(_src: { kind?: ReplanKind; by?: PlanActor; target?: SlotKey; changes: PlanChange[]; slots: PlanSlot[] }): ReviewModel {
  return notBuilt()
}

/** "date/slot/course": the key of a row's mark. */
export function markKey(key: SlotKey): string {
  return `${key.date}/${key.mealSlotId}/${key.courseId}`
}

/** The "was ..." text of every changed cell by `markKey` ("was Lentil soup", "was not planned"). */
export function changedMarks(_changes: PlanChange[]): Record<string, string> {
  return notBuilt()
}
