// Shapes of the /api/cook responses. See docs/dev/design/t14-cook-board.md.

export type StepKind = 'active' | 'passive' | 'advance'
export type TimerState = 'running' | 'paused' | 'finished'

export interface StepUse {
  ingredientId: number
  ingredient: string
  /** Already scaled by the Batches. */
  quantity: number
  unit: string
}

export interface CookStep {
  /** Index into the Recipe's Steps (what marks and timers use). */
  index: number
  /** 1-based position in the cooking sequence, and its length. */
  number: number
  of: number
  kind: StepKind
  text: string
  durationMinutes: number
  imageUrl: string
  uses: StepUse[]
  /** Set on Passive Steps only. */
  timer: { label: string; durationSeconds: number } | null
  /** Recipe Step indexes this Step waits for (it starts once they finish); absent in older fixtures = none. */
  after?: number[]
}

export interface AdvanceItem {
  step: number
  text: string
  leadTimeMinutes: number
  done: boolean
  doneAt: string | null
  warning: boolean
}

export interface CookTimer {
  id: number
  scope: string | null
  step: number | null
  /** Name of the Recipe the timer's scope cooks ("" or absent for a free timer). */
  recipeName?: string
  label: string
  durationSeconds: number
  state: TimerState
  /** Rounded up, as of the response's `now`. */
  remainingSeconds: number
  /** RFC 3339; null while paused. */
  endsAt: string | null
  startedAt: string
}

export interface CookView {
  scope: string
  recipeId: number
  recipeName: string
  batches: number
  meal: { date: string; mealSlotId: number } | null
  /** Household date (YYYY-MM-DD); a Planned Meal after it cannot be marked Cooked yet. */
  today: string
  advance: AdvanceItem[]
  steps: CookStep[]
  timers: CookTimer[]
}

export interface TimersResponse {
  /** Server time (RFC 3339) when the list was made, for clock-skew correction. */
  now: string
  timers: CookTimer[]
}

export interface StartTimerInput {
  scope?: string
  step?: number
  label?: string
  durationSeconds?: number
}

/** What one scope's Cook Mode is opened for. */
/** A Planned Meal is opened through its Course (crs-c3: no two-part scope); a Recipe through its id and Batches. */
export type CookSource = { kind: 'meal'; date: string; mealSlotId: number; courseId: number } | { kind: 'recipe'; recipeId: number; batches: number }

// ---- CRS F: the combined cooking timeline (GET /api/cook/meals/{date}/{slotId}/all, spec 11 and 16) ----

export type TimelineItemKind = 'active' | 'passive' | 'reheat' | 'serve'
export type TimelineCourseState = 'planned' | 'cooked' | 'skipped'

/** A Course of the slot with a Planned Meal; resolved ones are listed with their state and have no items. */
export interface TimelineCourse {
  courseId: number
  name: string
  recipeId: number
  recipeName: string
  /** The Course's cook scope. Until C3 the main Course's is two-part (`meal:<date>/<slotId>`), every other one three-part. */
  scope: string
  batches: number
  fresh: boolean
  state: TimelineCourseState
  /** Only for an unresolved Leftover Course. */
  reheatSeconds?: number
}

export interface TimelineAdvance {
  courseId: number
  scope: string
  step: number
  text: string
  leadTimeMinutes: number
  done: boolean
  doneAt: string | null
  warning: boolean
}

/** One item of the timeline: a Step, a Reheat or a Serve item, in on-screen order. */
export interface TimelineItem {
  courseId: number
  scope: string
  kind: TimelineItemKind
  /** The Recipe Step index (what timers and marks use); null for Reheat and Serve. */
  step: number | null
  /** 1-based position over the whole timeline. */
  number: number
  text: string
  durationMinutes: number
  /** Seconds from `startAt`. */
  startSeconds: number
  endSeconds: number
  uses: StepUse[]
  imageUrl: string
  /** Passive items: the Step's timer; Reheat items: `{ label: 'Reheat', durationSeconds }`; else null. */
  timer: { label: string; durationSeconds: number } | null
  /** Recipe Step indexes of the same Course this item waits for. */
  after: number[]
}

export interface TimelineView {
  date: string
  mealSlotId: number
  slotName: string
  /** "HH:MM", the slot time in household time. */
  time: string
  /** RFC 3339: the slot time minus `totalMinutes`. */
  startAt: string
  totalMinutes: number
  courses: TimelineCourse[]
  advance: TimelineAdvance[]
  items: TimelineItem[]
}

/** What a route opens: the slot's timeline, on one Course when `courseId` is given. */
export interface CookTimelineTarget {
  date: string
  mealSlotId: number
  courseId?: number
}
