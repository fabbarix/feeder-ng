/** One tile's place on the 4 x 3 board grid (1-based lines, spans in cells). */
export interface BoardCell {
  id: 'tonight' | 'clock' | 'nextAdvance' | 'leftovers' | 'timers' | 'useSoon' | 'tomorrow' | 'streak'
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

/**
 * The board layout (ui-fix-plan 5.13): a 4 x 3 grid with exactly 12 cells used and none twice. Tonight is the
 * 2 x 2 hero at the top left, then the clock, Next Advance Step, Leftovers, Timers, Use soon (2 x 1), Tomorrow
 * and the streak. BoardScreen renders the tiles in this order and gives each its span from here.
 */
export const BOARD_LAYOUT: BoardCell[] = [
  { id: 'tonight', col: 1, row: 1, colSpan: 2, rowSpan: 2 },
  { id: 'clock', col: 3, row: 1, colSpan: 1, rowSpan: 1 },
  { id: 'nextAdvance', col: 4, row: 1, colSpan: 1, rowSpan: 1 },
  { id: 'leftovers', col: 3, row: 2, colSpan: 1, rowSpan: 1 },
  { id: 'timers', col: 4, row: 2, colSpan: 1, rowSpan: 1 },
  { id: 'tomorrow', col: 1, row: 3, colSpan: 1, rowSpan: 1 },
  { id: 'useSoon', col: 2, row: 3, colSpan: 2, rowSpan: 1 },
  { id: 'streak', col: 4, row: 3, colSpan: 1, rowSpan: 1 },
]

/**
 * The same eight tiles on 2 columns (L-10, a phone): Tonight is a full-width hero, the clock and Next Advance Step,
 * Leftovers and Timers sit two by two, Use soon (up to five rows) is full width, then Tomorrow and the streak. Every row is full.
 */
const PHONE_LAYOUT: BoardCell[] = [
  { id: 'tonight', col: 1, row: 1, colSpan: 2, rowSpan: 1 },
  { id: 'clock', col: 1, row: 2, colSpan: 1, rowSpan: 1 },
  { id: 'nextAdvance', col: 2, row: 2, colSpan: 1, rowSpan: 1 },
  { id: 'leftovers', col: 1, row: 3, colSpan: 1, rowSpan: 1 },
  { id: 'timers', col: 2, row: 3, colSpan: 1, rowSpan: 1 },
  { id: 'useSoon', col: 1, row: 4, colSpan: 2, rowSpan: 1 },
  { id: 'tomorrow', col: 1, row: 5, colSpan: 1, rowSpan: 1 },
  { id: 'streak', col: 2, row: 5, colSpan: 1, rowSpan: 1 },
]

/**
 * B9-47 (TB-07): a portrait tablet (820 x 1180): 2 columns and 5 rows that fill one screen. The hero is a full row; the clock and
 * Next Advance Step, Leftovers and Timers sit two by two; Use soon is a full row; then Tomorrow and the streak.
 */
const PORTRAIT_LAYOUT: BoardCell[] = [
  { id: 'tonight', col: 1, row: 1, colSpan: 2, rowSpan: 1 },
  { id: 'clock', col: 1, row: 2, colSpan: 1, rowSpan: 1 },
  { id: 'nextAdvance', col: 2, row: 2, colSpan: 1, rowSpan: 1 },
  { id: 'leftovers', col: 1, row: 3, colSpan: 1, rowSpan: 1 },
  { id: 'timers', col: 2, row: 3, colSpan: 1, rowSpan: 1 },
  { id: 'useSoon', col: 1, row: 4, colSpan: 2, rowSpan: 1 },
  { id: 'tomorrow', col: 1, row: 5, colSpan: 1, rowSpan: 1 },
  { id: 'streak', col: 2, row: 5, colSpan: 1, rowSpan: 1 },
]

/**
 * B9-47 (SHORT-03): a phone held sideways (600 px wide or more, under 560 px high). Four columns of content-height rows that scroll:
 * the hero 2 x 2, the clock and Next Advance Step, Leftovers and Timers beside it, then Tomorrow across two columns (a long line
 * wraps across the double width), Use soon and the streak.
 */
const SCROLL_LAYOUT: BoardCell[] = [
  { id: 'tonight', col: 1, row: 1, colSpan: 2, rowSpan: 2 },
  { id: 'clock', col: 3, row: 1, colSpan: 1, rowSpan: 1 },
  { id: 'nextAdvance', col: 4, row: 1, colSpan: 1, rowSpan: 1 },
  { id: 'leftovers', col: 3, row: 2, colSpan: 1, rowSpan: 1 },
  { id: 'timers', col: 4, row: 2, colSpan: 1, rowSpan: 1 },
  { id: 'tomorrow', col: 1, row: 3, colSpan: 2, rowSpan: 1 },
  { id: 'useSoon', col: 3, row: 3, colSpan: 1, rowSpan: 1 },
  { id: 'streak', col: 4, row: 3, colSpan: 1, rowSpan: 1 },
]

/** B9-47 (TB-07, SHORT-03): the four board layouts. */
export type BoardLayoutKind = 'wall' | 'portrait' | 'scroll' | 'phone'

/**
 * The layout of a viewport: below 600 px wide the phone layout; from 600 px a portrait screen is the portrait layout, a landscape
 * one under 560 px high (a phone held sideways) the scroll layout, and anything else the 4 x 3 wall.
 */
export function boardLayoutKind(v: { wide: boolean; short: boolean; portrait: boolean }): BoardLayoutKind {
  if (!v.wide) return 'phone'
  if (v.portrait) return 'portrait'
  return v.short ? 'scroll' : 'wall'
}

const LAYOUTS: Record<BoardLayoutKind, BoardCell[]> = { wall: BOARD_LAYOUT, portrait: PORTRAIT_LAYOUT, scroll: SCROLL_LAYOUT, phone: PHONE_LAYOUT }

/** The cells of a layout by name; 2 and 4 still mean the phone and the wall layouts. */
export function boardLayout(columns: 2 | 4 | BoardLayoutKind): BoardCell[] {
  return LAYOUTS[columns === 2 ? 'phone' : columns === 4 ? 'wall' : columns]
}
