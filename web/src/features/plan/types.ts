// Shapes of the planning API (docs/dev/design/t11-planning.md). Dates are YYYY-MM-DD in household time.

export type WhyCode =
  | 'slot_rule'
  | 'leftover'
  | 'favourite'
  | 'perishable_use'
  | 'ingredient_overlap'
  | 'stock_coverage'
  | 'leftover_fits'
  /** Retired (ADR 0009): an old stored chip may still carry it; the SPA never shows it. */
  | 'best_available'
  /** ADR 0009 relaxed picks: `date` is the nearest fresh cook of the Recipe (before or after the slot). */
  | 'cooldown_relaxed'
  /** ADR 0009 relaxed picks: `tag`, and `value` (the count this week) or `date` (the adjacent day). */
  | 'variety_relaxed'

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
  /** CRS F: the Course of this Planned Meal. Optional until C3 removes the course-less routes (fixtures without it are the main Course). */
  courseId?: number
  courseName?: string
  /** CRS F: a Whole meal Recipe (spec 7.5: shown as the "Whole meal" chip on a slot that serves several Courses). */
  wholeMeal?: boolean
  /** CRS F (ADR 0009): picked by relaxing a Cool-down or Variety Rule; its why chips say which. */
  relaxed?: boolean
  /** WP6 (optional until the API sends them): minutes the Recipe takes, "HH:MM" to start by, a photo, the Recipe's Tags. */
  cookMinutes?: number
  /** R12: the Recipe's reheat time in minutes, sent only for a meal served from a Leftover and only when the Recipe has one. */
  reheatMinutes?: number
  startBy?: string
  photoUrl?: string
  tags?: string[]
}

export type UnfilledReason = 'no_attendance' | 'no_candidates' | 'no_course_recipes'

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

/** CRS G2 (spec 16): a Member as the Review Exclusions API names one (the Avatar needs all of it). */
export interface MemberRef {
  id: number
  name: string
  colour: string
  photoUrl?: string
  avatar?: string
}

/** CRS G2: one Exclusion that emptied a Course: a Member's Exclusion of an Ingredient (`ingredient` set) or of Recipes directly (`ingredient: null`). */
export interface ExclusionRecord {
  member: MemberRef
  ingredient: { id: number; name: string } | null
  /** At most 5, in name order. */
  recipes: { id: number; name: string }[]
  /** All the Recipes this Exclusion rules out in the cell; can exceed `recipes.length`. */
  recipeCount: number
}

/** CRS G2: one cell of GET /api/plan/couldnt-plan/exclusions (reason `no_candidates` with `eliminated.exclusion` above 0). */
export interface ExclusionCell {
  date: string
  mealSlotId: number
  mealSlotName: string
  time: string
  courseId: number
  courseName: string
  slotRuleClaimed: boolean
  eliminated: Eliminations
  /** The cell's Course Attendance on that date. */
  attendance: MemberRef[]
  /** Members of the slot who opt out of this Course on that date. */
  optOuts: MemberRef[]
  /** null before the first replan after the upgrade: no detail yet. */
  exclusions: ExclusionRecord[] | null
  moreExclusions: number
}

export interface SlotRule {
  id: number
  mealSlotId: number
  recipeId?: number
  recipeName?: string
  tag?: string
  /** CRS F: the Course the rule is for (real id). Absent in older fixtures = the main Course. */
  courseId?: number
}

/** A Member attending a Meal Slot (shown as an Avatar in the Planned Meal sheet). */
export interface AttendanceMember {
  id: number
  name: string
  /** #rrggbb, the Member's colour. */
  colour?: string
  /** PE: the Member's Photo address ("/api/images/<id>") and emoji; the Avatar shows photo, else emoji, else initials. */
  photoUrl?: string
  avatar?: string
}

/** CRS F: the main Course's Whole meal covers this Course on that date (spec 7.5). */
export interface CoveredBy {
  courseId: number
  recipeId: number
  recipeName: string
}

/** CRS F: why a Course with no Planned Meal has no reason either. */
export type Unserved = 'optional' | 'no_course_attendance'

/**
 * CRS F (spec 16): one Course of a slot on a date. At most one of meal, unfilled, coveredBy and unserved is set.
 * History rows (a Course the slot no longer serves, with a Cooked or Not cooked meal) come after the slot's Courses
 * with main false, optional false and no opt-outs.
 */
export interface PlanCourse {
  courseId: number
  name: string
  main: boolean
  optional: boolean
  /** The effective opt-outs on that date: Members of the slot's Attendance who do not eat this Course. */
  optOutMemberIds: number[]
  meal: PlannedMeal | null
  unfilled: Unfilled | null
  coveredBy: CoveredBy | null
  unserved: Unserved | null
}

export interface PlanSlot {
  date: string
  mealSlotId: number
  name: string
  time: string
  at: string
  portions: number
  rules: SlotRule[]
  /** WP6: optional until the API sends it. */
  attendance?: AttendanceMember[]
  /** The slot's Courses in the slot's order, then history rows. A slot carries no meal or reason of its own (crs-c3 §4). */
  courses?: PlanCourse[]
  /** CRS F: the slot's cooking timeline total in whole minutes; null when nothing fresh is left to cook. */
  cookMinutes?: number | null
  /** CRS F: "HH:MM" to start the timeline by (hero "start 18:45"). */
  startBy?: string
}

/** One entry of the flat to-confirm and couldn't-plan lists: a slot for one Course, with that Course's own meal or reason. */
export interface PlanEntry extends PlanSlot {
  courseId: number
  courseName: string
  meal: PlannedMeal | null
  unfilled: Unfilled | null
}

export interface PlanView {
  today: string
  horizonDays: number
  /** True while the planner is catching up with a change; the screen shows a small "Updating" note. */
  updating: boolean
  slots: PlanSlot[]
}

/** The key of one Planned Meal: its Meal Slot, its date and its Course (the real id, the main Course included). */
export interface SlotKey {
  date: string
  mealSlotId: number
  courseId: number
}

/** The key of a whole Meal Slot occurrence (the slot-wide routes: Cook Mode's timeline, Mark all Cooked, Not cooked whole slot). */
export interface SlotDayKey {
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
  /** WP6: optional until the API sends it. */
  photoUrl?: string
  /** CRS F: a Whole meal offered to the main Course, with the names of the Courses it would cover. */
  wholeMeal?: boolean
  covers?: string[]
  /** CRS F (ADR 0009): a relaxed alternative; the server sends strict ones first. */
  relaxed?: boolean
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
  fromCourseId?: number
}

/** A later Planned Meal the new Leftover is planned for (R4 B13). */
export interface PlannedForMeal {
  date: string
  mealSlotId: number
  mealSlotName: string
  recipeName: string
  courseId?: number
}

export interface CookedResult {
  meal: PlannedMeal
  leftover: Leftover | null
  warnings: StockWarning[]
  /** The later Planned Meals served from the recorded Leftover after the replan; empty when it is kept (or none). */
  plannedFor: PlannedForMeal[]
}

/** CRS F: POST .../all/cooked. */
export interface CookedAllResult {
  meals: PlannedMeal[]
  leftovers: Leftover[]
  warnings: StockWarning[]
  plannedFor: PlannedForMeal[]
}

/** CRS F: PUT a Recipe in a Course; `covered` lists the Courses a Whole meal in the main Course removed. */
export type SetMealResult = PlannedMeal & { covered?: number[] }

/** CRS F: one entry of the Mark all Cooked body; a Leftover Course has no leftoverPortions. */
export interface CookedAllEntry {
  courseId: number
  leftoverPortions?: number
}

export interface VarietyRule {
  tag: string
  maxPerWeek: number
  notConsecutiveDays: boolean
}

/** Structurally compatible with ui/Select RecipeChoice. */
export interface RecipeChoice {
  id: number
  name: string
  tags: string[]
  imageUrl?: string
  totalMinutes?: number
  /** CRS F: the Courses the Recipe is marked with (from `courses: [{id}]` of GET /api/recipes). */
  courseIds?: number[]
}

/** An existing Tag with the number of Recipes that carry it (GET /api/tags). */
export interface TagChoice {
  name: string
  recipes: number
}

export interface MealSlotChoice {
  id: number
  /** ISO weekday: 1 Monday .. 7 Sunday. */
  weekday: number
  name: string
  /** "HH:mm". */
  time: string
  /** CRS F: the Courses the slot serves, in its order (GET /api/meal-slots `courses`). */
  courses?: { id: number; name: string; main: boolean }[]
}
