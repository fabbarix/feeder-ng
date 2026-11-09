import type { ReactNode } from 'react'
import type { TimerItem } from '../../cook/hooks/useTimers'
import type { LeftoverRow } from '../lib/tiles'
import type { NextAdvance, SlotLike, StockTotalLike } from '../types'

// The kitchen board's tiles, composed from the shared Bento primitives (Tile,
// Chip, TimerTile, Button). Each renders its data and wires events only; all
// choosing and formatting lives in lib/tiles.ts. Big type comes from board.css.

export interface ClockTileProps {
  now: Date
  timeZone: string
  /** True when the dark/light switch uses the 19:00-07:00 fallback: shows a small Chip with strings.fallbackHint. */
  showFallbackHint: boolean
}
/** The clock (clockText) in very large type, the date (dateText) under it, and the fallback hint Chip when asked. */
export function ClockTile(_props: ClockTileProps): ReactNode {
  return null
}

export interface TonightTileProps {
  slot: SlotLike | null
}
/** Heading "Tonight", the Recipe name, and "<Meal Slot> · <time>"; "Nothing planned tonight" when null. */
export function TonightTile(_props: TonightTileProps): ReactNode {
  return null
}

export interface NextAdvanceTileProps {
  next: NextAdvance | null
  nowMs: number
  /** Marks it done (PUT /api/cook/marks) from the board. */
  onDone: (scope: string, step: number) => void
}
/** Heading "Next Advance Step", its text, the Recipe name, dueText; an "Overdue" Chip (spoil tone) when overdue; a "Done" button. "Nothing to prepare ahead" when null. */
export function NextAdvanceTile(_props: NextAdvanceTileProps): ReactNode {
  return null
}

/** Heading "Leftovers", one row per Leftover ("Stew · 2 portions · use by Thu"); "No Leftovers" when empty. Tone leftover. */
export function BoardLeftoversTile(_props: { rows: LeftoverRow[] }): ReactNode {
  return null
}

/** Heading "Use soon", one spoil-tone Chip per Ingredient; "Nothing to use up" when empty. */
export function UseSoonTile(_props: { rows: StockTotalLike[] }): ReactNode {
  return null
}

/** Heading "Timers", a TimerTile per timer (label, seconds, running = state running); "No timers running" when empty. Read-only: no handlers. */
export function BoardTimersTile(_props: { items: TimerItem[] }): ReactNode {
  return null
}

/** Heading "Tomorrow", one line per Planned Meal ("Dinner · Chicken stew"); "Nothing planned tomorrow" when empty. */
export function TomorrowTile(_props: { slots: SlotLike[] }): ReactNode {
  return null
}

/** Heading "Zero-waste streak" and "<n> days" ("1 day") in big type. */
export function StreakTile(_props: { days: number }): ReactNode {
  return null
}

export interface StartCookTileProps {
  /** Undefined disables the button (nothing planned). */
  onStart?: () => void
}
/** The big button "Start Cook Mode" (a Tile with onClick; disabled without onStart). */
export function StartCookTile(_props: StartCookTileProps): ReactNode {
  return null
}
