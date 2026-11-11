export type TileId =
  | 'nextMeal'
  | 'spoiled'
  | 'advanceSteps'
  | 'toConfirm'
  | 'couldntPlan'
  | 'setup'
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
  /** R13: the household is new and nothing can be planned yet: show the setup checklist (replaces Couldn't plan). */
  needsSetup?: boolean
  leftovers: number
  useSoon: number
  streakDays: number
  /** A query behind Today failed (or is waiting for the network) with nothing to show: not the same as nothing to do. */
  loadFailed?: boolean
}

/** Order and presence only: each tile component fixes its own Tile variant and span (ui-fix-plan 5.1). */
export interface TileSpec {
  id: TileId
}

export type TodayLayout =
  | { mode: 'shopping' }
  | {
      mode: 'today'
      tiles: TileSpec[]
      /** nothing to do today: show the witty empty state */
      empty: boolean
      /** the data could not be loaded: show an error, never the empty state */
      failed?: boolean
      /**
       * The hero's footprint on the wide (three-column) Today: `block` = 2 columns x 2 rows with small tiles beside it,
       * `row` = the full row, when no small tile (advanceSteps, leftovers, useSoon, streak) can sit beside it.
       */
      heroSpan: 'block' | 'row'
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
}

export interface UseSoonItem {
  ingredientId: number
  name: string
  /** short day wording for the row "Spinach · Thu": "today", "tomorrow" or the short weekday */
  when: string
}
