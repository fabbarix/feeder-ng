// Leftovers by hand (b5-low; docs/dev/design/b5-low.md; beta5-plan 2.3). Plain TypeScript, no React.

/** A Storage Place as the Leftover sheets need it. The stock feature's `StoragePlace` is assignable to it. */
export interface LeftoverPlace {
  id: number
  name: string
  kind: 'pantry' | 'fridge' | 'freezer'
  default?: boolean
}

/** `GET /api/plan/leftovers`: a Leftover with its Storage Place and the beta.5 fields. */
export interface Leftover {
  id: number
  recipeId: number
  recipeName: string
  /** Portions left. */
  portions: number
  cookedOn: string
  useBy: string
  fromDate: string
  fromMealSlotId: number
  fromCourseId?: number
  storagePlaceId: number | null
  storagePlaceName: string | null
  frozen: boolean
  frozenOn: string | null
  /** Past its Use-by with portions left: Feeder asks Had it, Threw it out or Wasn't there. */
  toAnswer: boolean
  /** Portions the Planned Meals served from it need. */
  plannedPortions: number
}

/** A Planned Meal that was replanned by an action (date, slot and Course, as the plan names them). */
export interface PlannedMealRef {
  date: string
  mealSlotId: number
  courseId?: number
  recipeName?: string
}

/** The answer of had-it, threw-out and take-out: the Leftover, flat, plus what was replanned. */
export type LeftoverResult = Leftover & { replanned: PlannedMealRef[] }

/** The answer of freeze: the frozen part and what is left (null when all of it was frozen). */
export interface FreezeResult {
  frozen: Leftover
  left: Leftover | null
  replanned: PlannedMealRef[]
}

export type LeftoverAnswer = 'had_it' | 'threw_out' | 'wasnt_there'

/** The four sheets, and the row menu entries that open them. */
export type LeftoverActionKind = 'had-it' | 'threw-out' | 'freeze' | 'take-out'

/** What a sheet confirms; `useLeftoverActions().run` turns it into the matching route. */
export type LeftoverRequest =
  | { kind: 'had-it'; portions: number }
  | { kind: 'threw-out'; portions: number }
  | { kind: 'freeze'; storagePlaceId: number; portions: number }
  | { kind: 'take-out'; storagePlaceId: number | null }

/** The Planned Meal that is served from a Leftover and needs portions of it (from the plan). */
export interface LeftoverClaim {
  date: string
  slotName: string
  portions: number
}
