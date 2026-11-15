// B9-32 (PC-11): the week grid's column count and each day's span. STUB (test author): the developer replaces it.
import type { RefCallback } from 'react'

export interface PlanGridLayout {
  /** Columns of the grid now: min(4, floor((container + gap) / (21 rem + gap))), 1 until the container is measured. */
  columns: number
  /** The span (of 12 tracks) of each of the `count` days, in order. */
  spans: number[]
  /** True for a day that has the whole row while the grid has more than one column: it lays its Meal Slots side by side. */
  rows: boolean[]
}

/** Measures the element it is given (a ResizeObserver on its content box) and answers the grid layout for `count` days. */
export function usePlanGrid(_count: number): PlanGridLayout & { ref: RefCallback<HTMLElement> } {
  throw new Error('B9-32: usePlanGrid is not built yet')
}
