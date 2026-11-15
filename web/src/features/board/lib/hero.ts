// B9-47 STUB (test author): the board's hero, chosen by the same selection as Today's (heroSelection).
import type { SlotLike } from '../types'
import type { TonightRow } from './tiles'

export interface BoardHero {
  slot: SlotLike
  day: 'today' | 'tomorrow' | 'later'
  /** heroEyebrow(selection, now), with its day word: ["Today", "Dinner", "start 13:00"]. */
  eyebrow: string[]
  /** "Start 13:00 · ready 19:00" under the Courses, or null. */
  startLine: string | null
  rows: TonightRow[]
  /** /cook/meal/<date>/<mealSlotId> */
  cookPath: string
}

export function boardHero(_slots: SlotLike[], _now: Date, _today: string): BoardHero | null {
  return null
}
