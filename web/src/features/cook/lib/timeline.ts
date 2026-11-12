// CRS F: pure helpers of the combined cooking timeline (spec 11). Plain TypeScript, no React.
// The server schedules (cook.Timeline); the SPA never reorders or re-times anything, it filters, labels and gates.
import { cookStrings as s } from '../strings'
import type { CookStep, CookTimer, TimelineAdvance, TimelineItem, TimelineView } from '../types'
import { mayResolve } from '../../plan/lib/resolve'
import { sameScope } from './scope'

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
export function visibleItems(view: TimelineView, filter: CourseFilter): VisibleItem[] {
  const items = filter === 'all' ? view.items : view.items.filter((i) => i.courseId === filter)
  return items.map((item, index) => ({ item, number: index + 1, of: items.length }))
}

export interface FilterChip {
  id: CourseFilter
  label: string
}

/** The Courses that have items in the timeline, in the slot's order. */
function coursesWithItems(view: TimelineView): TimelineView['courses'] {
  const ids = new Set(view.items.map((i) => i.courseId))
  return view.courses.filter((c) => ids.has(c.courseId))
}

/**
 * The filter chips: "All", then one chip per Course that still has items in the timeline, in the slot's order
 * (`view.courses` order). Resolved Courses and Courses without items get no chip. Empty when fewer than two Courses
 * have items (nothing to filter).
 */
export function filterChips(view: TimelineView): FilterChip[] {
  const withItems = coursesWithItems(view)
  if (withItems.length < 2) return []
  return [{ id: 'all', label: s.allCourses }, ...withItems.map((c) => ({ id: c.courseId, label: c.name }))]
}

/**
 * The planned clock time of an item, "HH:MM", counted back from the slot time: slotTime - totalMinutes + startSeconds,
 * seconds dropped (floored to the minute), wrapping at midnight. plannedClock('19:00', 30, 0) is "18:30";
 * plannedClock('19:00', 30, 1200) is "18:50"; plannedClock('00:10', 30, 0) is "23:40".
 */
export function plannedClock(slotTime: string, totalMinutes: number, startSeconds: number): string {
  const [h = 0, m = 0] = slotTime.split(':').map(Number)
  const day = 24 * 60
  const minutes = ((h * 60 + m - totalMinutes + Math.floor(startSeconds / 60)) % day + day) % day
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * The Step tile's Course caption, "Side · Green beans" (Course name, then Recipe name), only when the timeline has more
 * than one Course with items; null for a one-Course timeline (looks as before).
 */
export function itemCaption(view: TimelineView, item: TimelineItem): string | null {
  if (coursesWithItems(view).length < 2) return null
  const course = view.courses.find((c) => c.courseId === item.courseId)
  return course ? `${course.name} · ${course.recipeName}` : null
}

/**
 * A timeline item as the existing StepTile/CookNavTiles expect a Step: index = item.step ?? -1, number and of from the
 * VisibleItem, kind 'active' | 'passive' (reheat reads as passive, serve as active), text, durationMinutes, imageUrl,
 * uses, timer and after as sent.
 */
export function toCookStep(visible: VisibleItem): CookStep {
  const { item, number, of } = visible
  return {
    index: item.step ?? -1,
    number,
    of,
    kind: item.kind === 'passive' || item.kind === 'reheat' ? 'passive' : 'active',
    text: item.text,
    durationMinutes: item.durationMinutes,
    imageUrl: item.imageUrl,
    uses: item.uses,
    timer: item.timer,
    after: item.after,
  }
}

/**
 * The timers that hold Next (spec 11): timers of the NEXT item's own Course (`sameScope(timer.scope, next.scope,
 * mainCourseId)`) for a Step in `next.after`, still counting (state not finished, seconds above 0). A timer of another
 * Course's Step never holds, whatever its index. null `next` holds nothing. Keeps the order of `items`.
 */
export function holdingTimersFor<T extends { timer: CookTimer; seconds: number }>(
  next: Pick<TimelineItem, 'scope' | 'after'> | null,
  items: T[],
  mainCourseId: number | null,
): T[] {
  if (!next || next.after.length === 0) return []
  return items.filter(
    ({ timer, seconds }) =>
      timer.state !== 'finished' &&
      seconds > 0 &&
      timer.step !== null &&
      next.after.includes(timer.step) &&
      sameScope(timer.scope, next.scope, mainCourseId),
  )
}

export interface AdvanceGroup {
  courseId: number
  courseName: string
  /** Show the Course name as a sub-heading: only when more than one Course has Advance Steps. */
  named: boolean
  items: TimelineAdvance[]
}

/** The Advance Steps grouped by Course in the slot's order, each Course's in Step order; Courses without any are left out. */
export function advanceGroups(view: TimelineView): AdvanceGroup[] {
  const groups = view.courses
    .map((c) => ({
      courseId: c.courseId,
      courseName: c.name,
      named: false,
      items: view.advance.filter((a) => a.courseId === c.courseId).sort((a, b) => a.step - b.step),
    }))
    .filter((g) => g.items.length > 0)
  const named = groups.length > 1
  return groups.map((g) => ({ ...g, named }))
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
export function courseMenuEntries(view: TimelineView): CourseMenuEntry[] {
  const open = unresolvedCourses(view)
  if (open.length < 2) return []
  return open.flatMap(({ courseId }) => {
    const name = view.courses.find((c) => c.courseId === courseId)?.name ?? ''
    return [
      { id: `cooked:${courseId}`, courseId, action: 'cooked' as const, label: s.markCourseCooked(name) },
      { id: `notCooked:${courseId}`, courseId, action: 'notCooked' as const, label: s.notCookedCourse(name) },
    ]
  })
}

/** The Courses with a Planned Meal still to cook (state planned), as `{ courseId, fresh }` in the slot's order. */
export function unresolvedCourses(view: TimelineView): { courseId: number; fresh: boolean }[] {
  return view.courses.filter((c) => c.state === 'planned').map((c) => ({ courseId: c.courseId, fresh: c.fresh }))
}

/**
 * The filter to show. A chip whose Course has no item left (cooked, skipped, or not in the timeline) falls back to All,
 * so the screen never shows an empty list; a timeline with no items stays on All.
 */
export function effectiveFilter(view: TimelineView, filter: CourseFilter): CourseFilter {
  if (filter === 'all') return 'all'
  return view.items.some((i) => i.courseId === filter) ? filter : 'all'
}

/** All with two or more unresolved Courses: the last item offers Mark all Cooked for the whole slot. */
export function allMode(filter: CourseFilter, unresolved: { courseId: number }[]): boolean {
  return filter === 'all' && unresolved.length >= 2
}

/**
 * The Course that Mark as Cooked cooks: none in All (the whole slot); else the Course of the item on screen, else the
 * first unresolved Course; null when nothing is left to cook.
 */
export function markTarget(allModeOn: boolean, currentCourseId: number | null, unresolved: { courseId: number }[]): number | null {
  if (allModeOn) return null
  return currentCourseId ?? unresolved[0]?.courseId ?? null
}

/** Mark (all) as Cooked is offered for a day that may be resolved (today or past, a known household date) with a Course to cook. */
export function canMark(date: string, today: string, unresolved: { courseId: number }[]): boolean {
  return mayResolve(date, today) && unresolved.length > 0
}

export interface FinishedState {
  /** Something was Cooked on this screen (one Course or the whole slot). */
  cookedAny: boolean
  /** The server answered 409 not_cookable after that. */
  notCookable: boolean
  /** The timeline has loaded. */
  loaded: boolean
  unresolvedCount: number
}

/** The confirmation page replaces the screen: something was Cooked here and either nothing is left or the server says so. */
export function finishedCooking(s: FinishedState): boolean {
  return s.cookedAny && (s.notCookable || (s.loaded && s.unresolvedCount === 0))
}

/**
 * After a Course is skipped (Not cooked): leave Cook Mode when it was the last Course to cook and nothing was Cooked
 * here (no "No Steps" page); otherwise refresh the timeline.
 */
export function leaveIfNothingLeft(unresolvedCount: number, cookedAny: boolean): 'leave' | 'refresh' {
  return unresolvedCount <= 1 && !cookedAny ? 'leave' : 'refresh'
}

/** The header of Cook Mode: the slot name for several Courses, else the Recipe of the Course still to cook (or the slot name). */
export function title(view: TimelineView, several: boolean): string {
  if (several) return view.slotName
  return view.courses.find((c) => c.state === 'planned')?.recipeName ?? view.slotName
}

/**
 * The name on the confirmation page: the Recipe when one Course was Cooked (not the first Course of the slot), the slot
 * name when several were or none, '' without a view.
 */
export function confirmationName(view: TimelineView | undefined, cookedCourseIds: number[]): string {
  if (!view) return ''
  if (cookedCourseIds.length === 1) {
    const course = view.courses.find((c) => c.courseId === cookedCourseIds[0])
    if (course) return course.recipeName
  }
  return view.slotName
}
