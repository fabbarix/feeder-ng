// Stage copy, poll and back-off policy of a running read (docs/dev/design/ra-e-import.md section 4.2). Plain TypeScript.
import type { ReadInput, ReadState } from '../types'

export const POLL_DEADLINE_MS = 320_000 // the server cuts a read at 300 s
export const MAX_POLL_FAILURES = 5

const POLL_DELAYS = [500, 500, 1000, 1000, 1500, 2000]
const STAGE_COPY: Partial<Record<ReadState, string>> = {
  fetching: 'Opening the page…',
  preparing: 'Preparing the photos…',
  reading: 'Reading the recipe…',
  checking: 'Checking the result…',
  images: 'Fetching photos…',
}

/** done, failed and cancelled. */
export function isTerminal(state: ReadState): boolean {
  return state === 'done' || state === 'failed' || state === 'cancelled'
}
/** The stage as a sentence; '' for a final state. */
export function stageCopy(state: ReadState): string {
  return STAGE_COPY[state] ?? ''
}
/** The states a read of this kind passes through, in order, ending before `done`. */
export function stagesFor(kind: ReadInput['kind']): ReadState[] {
  if (kind === 'url') return ['fetching', 'reading', 'checking', 'images']
  if (kind === 'text') return ['reading', 'checking', 'images']
  return ['preparing', 'reading', 'checking']
}
/** After 20 s: "Still working… 25 s"; before: null. */
export function elapsedNote(seconds: number): string | null {
  if (seconds < 20) return null
  if (seconds < 60) return `Still working… ${seconds} s`
  return `Still working… ${Math.floor(seconds / 60)} min ${seconds % 60} s`
}
/** Milliseconds before poll number `attempt` (0-based). */
export function pollDelay(attempt: number): number {
  return POLL_DELAYS[Math.min(Math.max(attempt, 0), POLL_DELAYS.length - 1)] ?? 2000
}
/** Milliseconds before retrying after `failures` consecutive failed polls (1-based). */
export function errorBackoff(failures: number): number {
  return Math.min(1000 * 2 ** Math.max(failures - 1, 0), 8000)
}
export function shouldGiveUp(o: { failures: number; elapsedMs: number }): boolean {
  return o.failures >= MAX_POLL_FAILURES || o.elapsedMs >= POLL_DEADLINE_MS
}
