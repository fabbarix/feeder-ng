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

/** The layout for a 2-column phone board (L-10) or the 4 x 3 wall board. */
export function boardLayout(columns: 2 | 4): BoardCell[] {
  return columns === 2 ? PHONE_LAYOUT : BOARD_LAYOUT
}
