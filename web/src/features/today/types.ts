export type TileId =
  | 'nextMeal'
  | 'spoiled'
  | 'advanceSteps'
  | 'toConfirm'
  | 'couldntPlan'
  | 'setup'
  | 'leftovers'
  | 'useSoon'
  | 'metrics'
  /** B9-44 (TB-12): the Shopping session tile, first while a Scan session is active on this phone. */
  | 'shopping'

/** Counts only: each owning feature renders its own tile, Today decides which show and how big. */
export interface TodayData {
  scanSessionActive: boolean
  hasNextMeal: boolean
  spoiled: number
  advanceSteps: number
  toConfirm: number
  couldntPlan: number
  /** R13: the household is new and nothing can be planned yet: show the setup checklist (replaces Couldn't plan). */
  needsSetup?: boolean
  leftovers: number
  useSoon: number
  streakDays: number
  /** DS-TODAY: the Lines of the Shopping List still to buy (Today's Lines to get metric). */
  linesToGet: number
  /** A query behind Today failed (or is waiting for the network) with nothing to show: not the same as nothing to do. */
  loadFailed?: boolean
}

/** Order and presence only: each tile component fixes its own Tile variant and span (ui-fix-plan 5.1). */
export interface TileSpec {
  id: TileId
}

export type TodayLayout =
  /** B9-44 (TB-12): no longer produced (a Scan session is the `shopping` tile); the developer deletes this member with the Shopping List screen seam. */
  | { mode: 'shopping' }
  | {
      mode: 'today'
      /** B9-44 (TB-03): every tile in DOM order (the aside's tiles follow To confirm), `aside` names the ones that sit in the aside. */
      tiles: TileSpec[]
      /** B9-44 (TB-03): the ids that go into `.today__aside`, in order: Advance Steps, then the metric strip (the ones that are present). */
      aside?: TileId[]
      /** nothing to do today: show the witty empty state */
      empty: boolean
      /** the data could not be loaded: show an error, never the empty state */
      failed?: boolean
    }

export interface AdvanceStepDue {
  mealDate: string
  mealSlotId: number
  recipeName: string
  description: string
  dueAt: string
  /** "HH:MM" in household time */
  dueTime: string
  slotTime: string
  state: 'due' | 'upcoming'
  /** CRS F: the Course of the Planned Meal (GET /api/today/advance-steps). */
  courseId?: number
  courseName?: string
  /** B9-44 (TB-02): the cook marks key the Done button writes (`PUT /api/cook/marks {scope, step, done}`). */
  scope: string
  step: number
  /** B9-44 (TB-02): due before now, with the Planned Meal still ahead (the badge says "Overdue"). */
  overdue?: boolean
  /** B9-44 (TB-02): "Dinner", for the meta "For Mon Dinner · Cauliflower al gorgonzola". */
  mealSlotName?: string
}

export interface UseSoonItem {
  ingredientId: number
  name: string
  /** short day wording for the row "Spinach · Thu": "today", "tomorrow" or the short weekday */
  when: string
  /** B9-44 (TB-11): the amount of the Ingredient that goes off on its soonest go-off date (the row's value, "500 g"). */
  quantity?: number
  baseUnit?: 'g' | 'ml' | 'piece'
  /** B9-44 (TB-11): the Lot that goes off soonest; pressing the row opens its Lot sheet. */
  soonestLotId?: number
}
