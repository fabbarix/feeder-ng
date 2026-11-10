// Shapes of the planning API (docs/dev/design/t11-planning.md). Dates are YYYY-MM-DD in household time.

export type WhyCode =
  | 'slot_rule'
  | 'leftover'
  | 'favourite'
  | 'perishable_use'
  | 'ingredient_overlap'
  | 'stock_coverage'
  | 'leftover_fits'
  | 'best_available'

/** A structured why chip. The server adds the names; lib/phrase.ts turns it into words. */
export interface Why {
  code: WhyCode
  value?: number
  memberIds?: number[]
  members?: string[]
  ingredientId?: number
  ingredient?: string
  recipeId?: number
  recipe?: string
  tag?: string
  date?: string
}

export type MealState = 'planned' | 'cooked' | 'skipped'

export interface LeftoverSource {
  leftoverId: number | null
  date: string
  mealSlotId: number
  recipeName: string
}

export interface PlannedMeal {
  date: string
  mealSlotId: number
  recipeId: number
  recipeName: string
  batches: number
  portions: number
  state: MealState
  pinned: boolean
  servedFromLeftover: LeftoverSource | null
  why: Why[]
}

export type UnfilledReason = 'no_attendance' | 'no_candidates'

export interface Eliminations {
  considered: number
  exclusion: number
  coolDown: number
  varietyRule: number
  advanceStep: number
}

export interface Unfilled {
  reason: UnfilledReason
  slotRuleClaimed: boolean
  eliminated: Eliminations
}

export interface SlotRule {
  id: number
  mealSlotId: number
  recipeId?: number
  recipeName?: string
  tag?: string
}

export interface PlanSlot {
  date: string
  mealSlotId: number
  name: string
  time: string
  at: string
  portions: number
  meal: PlannedMeal | null
  unfilled: Unfilled | null
  rules: SlotRule[]
}

export interface PlanView {
  today: string
  horizonDays: number
  /** True while the planner is catching up with a change; the screen shows a small "Updating" note. */
  updating: boolean
  slots: PlanSlot[]
}

export interface SlotKey {
  date: string
  mealSlotId: number
}

export interface Alternative {
  recipeId: number
  recipeName: string
  batches: number
  newLeftoverPortions: number
  newLeftoverUseBy: string
  score: number
  why: Why[]
}

export interface CookPreview {
  meal: PlannedMeal
  fresh: boolean
  batches: number
  yield: number
  portionsNeeded: number
  proposedLeftover: number
  maxLeftover: number
  leftoverUseBy: string
  needs: { ingredientId: number; ingredient: string; quantity: number }[]
}

export interface StockWarning {
  ingredientId: number
  name: string
  baseUnit: string
  have: number
  need: number
  shortfall: number
  message: string
}

export interface Leftover {
  id: number
  recipeId: number
  recipeName: string
  portions: number
  cookedOn: string
  useBy: string
  fromDate: string
  fromMealSlotId: number
}

/** A later Planned Meal the new Leftover is planned for (R4 B13). */
export interface PlannedForMeal {
  date: string
  mealSlotId: number
  mealSlotName: string
  recipeName: string
}

export interface CookedResult {
  meal: PlannedMeal
  leftover: Leftover | null
  warnings: StockWarning[]
  /** The later Planned Meals served from the recorded Leftover after the replan; empty when it is kept (or none). */
  plannedFor: PlannedForMeal[]
}

export interface VarietyRule {
  tag: string
  maxPerWeek: number
  notConsecutiveDays: boolean
}

export interface RecipeChoice {
  id: number
  name: string
}

export interface MealSlotChoice {
  id: number
  weekday: number
  name: string
}
