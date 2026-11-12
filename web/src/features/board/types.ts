// Shapes of /api/board and the slices of other features' data the board reads.
// Structural types, so the board does not import other features' internals;
// features/plan's PlanSlot, Leftover and features/stock's IngredientStock satisfy them.

export interface BoardTheme {
  dark: boolean
  /** RFC 3339: when the board should switch (sunrise or sunset, or 07:00/19:00 in the fallback). */
  nextChangeAt: string
  source: 'sun' | 'fallback'
  reason: '' | 'no_location' | 'city_only'
}

export interface NextAdvance {
  scope: string
  recipeName: string
  step: number
  text: string
  leadTimeMinutes: number
  dueAt: string
  overdue: boolean
  mealDate: string
  mealSlotId: number
  slotName: string
  /** CRS F: the Course of the Advance Step; `scope` is that Course's (Done sends it as it is). */
  courseId?: number
  courseName?: string
}

export interface BoardData {
  now: string
  today: string
  theme: BoardTheme
  streak: { days: number }
  nextAdvance: NextAdvance | null
  /** CRS F: today's and tomorrow's slots in the shape of GET /api/plan (with `courses`). Absent in older payloads: the board then reads /api/plan. */
  slots?: SlotLike[]
}

/** A Meal Slot on a date, with its Planned Meal if any (T11's PlanSlot, structurally). */
export interface SlotLike {
  date: string
  mealSlotId: number
  name: string
  time: string
  /** RFC 3339 instant of the slot. */
  at: string
  /** The slot's Courses in the slot's order (T11's PlanCourse, structurally); a slot carries no meal of its own (crs-c3). */
  courses?: CourseLike[]
  cookMinutes?: number | null
  startBy?: string
}

/** CRS F: one Course of a slot, as the board needs it. */
export interface CourseLike {
  courseId: number
  name: string
  main: boolean
  meal: { recipeId: number; recipeName: string; batches: number; portions: number; state: 'planned' | 'cooked' | 'skipped'; wholeMeal?: boolean; relaxed?: boolean } | null
  unfilled?: { reason: string } | null
  coveredBy?: { courseId: number; recipeId: number; recipeName: string } | null
  unserved?: 'optional' | 'no_course_attendance' | null
}

export interface LeftoverLike {
  id: number
  recipeId: number
  recipeName: string
  portions: number
  useBy: string
}

export interface StockTotalLike {
  ingredientId: number
  name: string
  baseUnit: string
  total: number
  nextGoesOff: string | null
  useSoon: boolean
  spoiledCount: number
}
