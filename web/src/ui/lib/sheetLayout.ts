// B9-14 / SHORT-02: the pure decisions behind the sheet layout. Heights are in px.

/** The footer follows the body once the body would show less than this share of the panel. */
export const SHEET_FLOW_RATIO = 0.4
/** A short viewport (phone landscape, an on-screen keyboard, 400 % zoom): the sheet takes the full height, no grip. */
export const SHORT_VIEWPORT_QUERY = '(max-height: 499px)'
/**
 * A Popover shows as a BottomSheet on a phone or a short viewport. Popover reads the width half through useBreakpoint('md') (the one
 * breakpoint table, DS-09) and the height half through POPOVER_SHEET_HEIGHT_QUERY.
 */
export const POPOVER_SHEET_QUERY = '(max-width: 767px), (max-height: 599px)'
/** The height half of POPOVER_SHEET_QUERY: phone landscape has no height to place a popover in (SHORT-07). */
export const POPOVER_SHEET_HEIGHT_QUERY = '(max-height: 599px)'

/** The body floor, min(96 px, 30 % of the viewport height): what rule P33 judges by. */
const BODY_FLOOR_PX = 96
const BODY_FLOOR_SHARE = 0.3

/**
 * SHORT-02 rule 5: true when the body would show less than 40 % of the panel while its content is taller than what it shows.
 * The sheet then scrolls as one, the footer following the body (`data-footer="flow"`).
 */
export function footerShouldFlow({ panel, body, bodyScroll }: { panel: number; body: number; bodyScroll: number }): boolean {
  if (panel <= 0) return false
  if (bodyScroll <= body) return false
  return body < panel * SHEET_FLOW_RATIO
}

export function sheetBodyFloor(innerHeight: number): number {
  return Math.min(BODY_FLOOR_PX, BODY_FLOOR_SHARE * innerHeight)
}
