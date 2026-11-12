// CRS F: Cook Mode on the slot's cooking timeline (spec 11). STUB.
import type { AdvanceGroup, CourseFilter, FilterChip, VisibleItem } from '../lib/timeline'
import type { StepNav } from '../lib/steps'
import type { CookStep, CookTimelineTarget, TimelineView } from '../types'

export interface UseCookTimeline {
  view: TimelineView | undefined
  isLoading: boolean
  error: Error | null
  /** The server answered 409 not_cookable (no Course is left to cook). */
  notCookable: boolean
  /** The main Course's id (useCourses), null until known: the scope helper needs it. */
  mainCourseId: number | null
  filter: CourseFilter
  /** Changing the filter keeps the position of every filter: coming back to a chip returns to where it was. */
  setFilter: (filter: CourseFilter) => void
  chips: FilterChip[]
  /** The items of the current filter (lib/timeline visibleItems). */
  items: VisibleItem[]
  nav: StepNav
  current: VisibleItem | null
  /** The current item as a Step for StepTile/CookNavTiles (lib/timeline toCookStep); null without items. */
  step: CookStep | null
  /** "Side · Green beans" or null (lib/timeline itemCaption). */
  caption: string | null
  /** The planned clock time of the current item, "18:52" (lib/timeline plannedClock). */
  clock: string | null
  next: () => void
  back: () => void
  isFirst: boolean
  isLast: boolean
  repeatCount: number
  repeat: () => void
  advance: AdvanceGroup[]
  /** PUT /api/cook/marks with the scope of the Advance Step's own Course, then refetch. */
  markAdvanceDone: (scope: string, step: number) => Promise<void>
  /** Starts the timer of the current Passive or Reheat item (no-op on others). */
  startItemTimer: () => Promise<void>
}

/**
 * The timeline of one slot: react-query ['cook','view','timeline',date,slotId] fed by cookApi.timeline. Opens on
 * `target.courseId` as the filter when given, else on All. Reaching a Passive item starts its timer once per
 * (Course, Step) through startTimer({ scope: item.scope, step }); reaching a Reheat item starts the free Reheat timer
 * ({ scope: item.scope, label: 'Reheat', durationSeconds }) unless reheatTimerOfCourse already finds one. Refetches
 * on the SSE topics `cook`, `plan` and `household` and after a reconnect.
 */
export function useCookTimeline(_target: CookTimelineTarget): UseCookTimeline {
  throw new Error('CRS F: not implemented')
}
