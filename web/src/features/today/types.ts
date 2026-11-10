export type TileId =
  | 'nextMeal'
  | 'spoiled'
  | 'advanceSteps'
  | 'toConfirm'
  | 'couldntPlan'
  | 'leftovers'
  | 'useSoon'
  | 'streak'

/** Counts only: each owning feature renders its own tile, Today decides which show and how big. */
export interface TodayData {
  scanSessionActive: boolean
  hasNextMeal: boolean
  spoiled: number
  advanceSteps: number
  toConfirm: number
  couldntPlan: number
  leftovers: number
  useSoon: number
  streakDays: number
}

/** Order and presence only: each tile component fixes its own Tile variant and span (ui-fix-plan 5.1). */
export interface TileSpec {
  id: TileId
}

export type TodayLayout =
  | { mode: 'shopping' }
  | { mode: 'today'; tiles: TileSpec[]; /** nothing to do today: show the witty empty state */ empty: boolean }

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
}

export interface UseSoonItem {
  ingredientId: number
  name: string
  /** short day wording for the row "Spinach · Thu": "today", "tomorrow" or the short weekday */
  when: string
}
