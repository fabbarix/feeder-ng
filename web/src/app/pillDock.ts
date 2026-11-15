// PC-04, w4a review: where the shell's timer pill docks in a short viewport (below 64em wide, under 500 px tall) on a page with a
// floating Save bar: inside the bar's free start, level with it, so the pill covers no page content and nothing of the bar. Plain
// TypeScript, no React.

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The pill's top-left corner docked at the start of the bar (`pad` in from its edge, centred on its height), or null when the bar is
 * not wholly on screen or the room before its first control (less `pad` on both sides) is narrower than the pill.
 */
export function pillDock(bar: Box, controlsLeft: number, pill: { width: number; height: number }, pad: number, viewportHeight: number): { x: number; y: number } | null {
  if (bar.width <= 0 || bar.height <= 0) return null
  if (bar.top < 0 || bar.top + bar.height > viewportHeight) return null
  const x = bar.left + pad
  if (x + pill.width + pad > controlsLeft) return null
  return { x: Math.round(x), y: Math.round(bar.top + (bar.height - pill.height) / 2) }
}

/** P32 (system.md 11): fixed and sticky chrome may cover at most 35 % of the viewport height. */
export const CHROME_BUDGET = 0.35
/** The narrowest the pill may be in the top bar: its icon, the time and a "+N" still show (the label ellipses first). */
export const TOP_DOCK_MIN_WIDTH = 140

/**
 * B9-55 (int2 finding 2): below 64em on a page with a sticky action bar, the pill floats `lift` above that bar. When the bottom bar, the
 * action bar and the pill together would take more than CHROME_BUDGET of the height (375 x 667 on a Recipe: the pill covered the
 * hero chip line), the pill goes to the top bar instead, between the brand and Your menu, as it sits in the top bar from 64em.
 * Returns where it starts and how wide it may be, or null (it floats as usual) when the bottom stack fits the budget or the room
 * between the brand and Your menu (less `gap` on each side) is narrower than TOP_DOCK_MIN_WIDTH.
 */
export function pillTopDock(o: { barTop: number; pillHeight: number; viewportHeight: number; brandRight: number; menuLeft: number; gap: number; lift: number }): { x: number; maxWidth: number } | null {
  if (o.viewportHeight <= 0) return null
  const floatingTop = o.barTop - o.lift - o.pillHeight
  if ((o.viewportHeight - floatingTop) / o.viewportHeight <= CHROME_BUDGET) return null
  const x = o.brandRight + o.gap
  const maxWidth = o.menuLeft - o.gap - x
  if (maxWidth < TOP_DOCK_MIN_WIDTH) return null
  return { x: Math.round(x), maxWidth: Math.floor(maxWidth) }
}
