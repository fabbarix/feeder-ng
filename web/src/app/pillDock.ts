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
