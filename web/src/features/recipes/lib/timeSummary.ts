// The time facts of a Recipe for tiles and the detail metrics (ui-fix-plan 5.8, 5.9). Plain TypeScript.

export interface TimeSummary {
  /** "45 min", or null when the Recipe has no timeline Steps. */
  total: string | null
  /** "+4 h ahead" for the longest Advance Step, or null when there is none. */
  ahead: string | null
}

/** Total time (critical path, Advance Steps excluded) and the Advance lead time, formatted with formatMinutes. */
export function timeSummary(r: { totalMinutes: number; advanceMinutes: number }): TimeSummary {
  void r
  throw new Error('not implemented')
}
