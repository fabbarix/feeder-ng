// DS-TODAY: a long list is capped at a few rows with "Show N more" (Throw out or keep? on Today: 3 rows). Plain TypeScript.

/** Rows shown before "Show N more". */
export const SHOW_MORE_CAP = 3

export interface CappedRows<T> {
  /** The rows to render. */
  visible: T[]
  /** Rows hidden behind "Show N more". */
  hidden: number
  /** The list is longer than the cap, so the toggle is offered (also when expanded, for "Show less"). */
  capped: boolean
}

/** The first `cap` rows, or every row when `expanded`. Never mutates `rows`. */
export function capRows<T>(rows: readonly T[], cap: number, expanded: boolean): CappedRows<T> {
  const capped = rows.length > cap
  if (!capped || expanded) return { visible: [...rows], hidden: 0, capped }
  return { visible: rows.slice(0, cap), hidden: rows.length - cap, capped }
}
