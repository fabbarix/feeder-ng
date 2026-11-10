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
export type CookSource = { kind: 'meal'; date: string; mealSlotId: number } | { kind: 'recipe'; recipeId: number; batches: number }
