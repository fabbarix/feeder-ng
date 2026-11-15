import { useMediaQuery } from '../../../ui'
import { boardLayoutKind, type BoardLayoutKind } from '../lib/layout'

/** The media queries board.css uses for the same layouts besides the 37.5 em width (keep them in step). */
export const BOARD_QUERIES = {
  /** Under 560 px high: a phone held sideways scrolls (SHORT-03). */
  short: '(max-height: 34.9375em)',
  portrait: '(orientation: portrait)',
} as const

/** B9-47 (TB-07, SHORT-03): the board layout of this viewport (wall, portrait, scroll or phone); `wide` is useBreakpoint('tablet'). */
export function useBoardLayout(wide: boolean): BoardLayoutKind {
  const short = useMediaQuery(BOARD_QUERIES.short)
  const portrait = useMediaQuery(BOARD_QUERIES.portrait)
  return boardLayoutKind({ wide, short, portrait })
}
