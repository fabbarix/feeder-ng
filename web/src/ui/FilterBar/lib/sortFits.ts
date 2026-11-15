// B9-15 (DS-03, decision DS 6): whether the Sort chip of a FilterBar view row fits with its value shown, beside the view control.

export interface SortRowMetrics {
  /** The view row's inner width. */
  row: number
  /** The view control's width. */
  view: number
  /** The Sort chip's natural width with its value shown (measured on a hidden copy). */
  natural: number
  /** The gap between the view control and the Sort. */
  gap: number
}

/** natural <= row - view - gap. */
export function sortFits({ row, view, natural, gap }: SortRowMetrics): boolean {
  return natural <= row - view - gap
}
