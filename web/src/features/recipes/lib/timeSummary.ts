// The time facts of a Recipe for tiles and the detail metrics (ui-fix-plan 5.8, 5.9). Plain TypeScript.
import { recipeStrings } from '../strings'
import { formatMinutes } from './time'

export interface TimeSummary {
  /** "45 min", or null when the Recipe has no timeline Steps. */
  total: string | null
  /** "+4 h ahead" for the longest Advance Step, or null when there is none. */
  ahead: string | null
  /** RX-07: the Steps of a Recipe that has Steps and no time at all (none timed, no Advance Step); null otherwise. */
  untimedSteps: number | null
}

/** Total time (critical path, Advance Steps excluded) and the Advance lead time, formatted with formatMinutes. */
export function timeSummary(r: { totalMinutes: number; advanceMinutes: number; stepCount?: number }): TimeSummary {
  return {
    total: r.totalMinutes > 0 ? formatMinutes(r.totalMinutes) : null,
    ahead: r.advanceMinutes > 0 ? recipeStrings.advanceChip(formatMinutes(r.advanceMinutes), recipeStrings.advanceWord) : null,
    untimedSteps: r.totalMinutes <= 0 && r.advanceMinutes <= 0 && (r.stepCount ?? 0) > 0 ? r.stepCount! : null,
  }
}
