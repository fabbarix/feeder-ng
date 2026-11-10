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
export const BOARD_LAYOUT: BoardCell[] = []
