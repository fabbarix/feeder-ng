// SR-int: where the page scrolls so the row being priced sits just above the Price entry sheet (shop-scan-proposals.md
// 13.4). Plain TypeScript, no React, no DOM.

/** The gap between the row and the top of the sheet, in px. */
export const ROW_GAP = 8

/**
 * How far to scroll the page (px, positive is down) so the row's bottom sits `gap` above the sheet's top edge. `row` and
 * `sheetTop` are viewport coordinates (getBoundingClientRect). 0 when it already sits there (to the pixel).
 */
export function scrollAboveSheet(row: { top: number; bottom: number }, sheetTop: number, gap: number = ROW_GAP): number {
  const delta = Math.round(row.bottom + gap - sheetTop)
  return Math.abs(delta) < 1 ? 0 : delta
}
