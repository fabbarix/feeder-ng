// CRS F: pure helpers of the combined cooking timeline (spec 11). Plain TypeScript, no React. STUBS.
// The server schedules (cook.Timeline); the SPA never reorders or re-times anything, it filters, labels and gates.
import type { CookStep, CookTimer, TimelineAdvance, TimelineItem, TimelineView } from '../types'

const TODO = (): never => {
  throw new Error('CRS F: not implemented')
}

/** The chip choice: the whole timeline, or one Course by id. */
export type CourseFilter = 'all' | number

/** An item with its position in the list it is shown in. */
export interface VisibleItem {
  item: TimelineItem
  /** 1-based position in the shown list ("Step 4 of 11") and the list length. */
  number: number
  of: number
}

/**
 * The items shown for a filter. 'all': the timeline as sent, `number` and `of` over the whole timeline. A Course: only
 * its items, in Recipe order (the order they have in `view.items`), numbered 1..M of M (its own position).
 */
export function visibleItems(_view: TimelineView, _filter: CourseFilter): VisibleItem[] {
  return TODO()
}

export interface FilterChip {
  id: CourseFilter
  label: string
}

/**
 * The filter chips: "All", then one chip per Course that still has items in the timeline, in the slot's order
 * (`view.courses` order). Resolved Courses and Courses without items get no chip. Empty when fewer than two Courses
 * have items (nothing to filter).
 */
export function filterChips(_view: TimelineView): FilterChip[] {
  return TODO()
}

/**
 * The planned clock time of an item, "HH:MM", counted back from the slot time: slotTime - totalMinutes + startSeconds,
 * seconds dropped (floored to the minute), wrapping at midnight. plannedClock('19:00', 30, 0) is "18:30";
 * plannedClock('19:00', 30, 1200) is "18:50"; plannedClock('00:10', 30, 0) is "23:40".
 */
export function plannedClock(_slotTime: string, _totalMinutes: number, _startSeconds: number): string {
  return TODO()
}

/**
 * The Step tile's Course caption, "Side · Green beans" (Course name, then Recipe name), only when the timeline has more
 * than one Course with items; null for a one-Course timeline (looks as before).
 */
export function itemCaption(_view: TimelineView, _item: TimelineItem): string | null {
  return TODO()
}

/**
 * A timeline item as the existing StepTile/CookNavTiles expect a Step: index = item.step ?? -1, number and of from the
 * VisibleItem, kind 'active' | 'passive' (reheat reads as passive, serve as active), text, durationMinutes, imageUrl,
 * uses, timer and after as sent.
 */
export function toCookStep(_visible: VisibleItem): CookStep {
  return TODO()
}

/**
 * The timers that hold Next (spec 11): timers of the NEXT item's own Course (`sameScope(timer.scope, next.scope,
 * mainCourseId)`) for a Step in `next.after`, still counting (state not finished, seconds above 0). A timer of another
 * Course's Step never holds, whatever its index. null `next` holds nothing. Keeps the order of `items`.
 */
export function holdingTimersFor<T extends { timer: CookTimer; seconds: number }>(
  _next: Pick<TimelineItem, 'scope' | 'after'> | null,
  _items: T[],
  _mainCourseId: number | null,
): T[] {
  return TODO()
}

export interface AdvanceGroup {
  courseId: number
  courseName: string
  /** Show the Course name as a sub-heading: only when more than one Course has Advance Steps. */
  named: boolean
  items: TimelineAdvance[]
}

/** The Advance Steps grouped by Course in the slot's order, each Course's in Step order; Courses without any are left out. */
export function advanceGroups(_view: TimelineView): AdvanceGroup[] {
  return TODO()
}

export interface CourseMenuEntry {
  id: string
  courseId: number
  action: 'cooked' | 'notCooked'
  label: string
}

/**
 * The Course menu: for each unresolved Course (state planned) in the slot's order, "Mark <Course> as Cooked" then
 * "Not cooked: <Course>". Empty when the slot has fewer than two unresolved Courses (the menu is not shown then).
 */
export function courseMenuEntries(_view: TimelineView): CourseMenuEntry[] {
  return TODO()
}

/** The Courses with a Planned Meal still to cook (state planned), as `{ courseId, fresh }` in the slot's order. */
export function unresolvedCourses(_view: TimelineView): { courseId: number; fresh: boolean }[] {
  return TODO()
}
