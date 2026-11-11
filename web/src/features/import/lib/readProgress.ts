// Stage copy, poll and back-off policy of a running read (docs/dev/design/ra-e-import.md section 4.2). Plain TypeScript.
import type { ReadInput, ReadState } from '../types'

export const POLL_DEADLINE_MS = 200_000 // the server cuts a read at 180 s
export const MAX_POLL_FAILURES = 5

/** done, failed and cancelled. */
export function isTerminal(state: ReadState): boolean {
  void state
  throw new Error('TODO(ra-e developer): not implemented')
}
/** "Opening the page…", "Preparing the photos…", "Reading the recipe…", "Checking the result…", "Fetching photos…"; '' for a final state. */
export function stageCopy(state: ReadState): string {
  void state
  throw new Error('TODO(ra-e developer): not implemented')
}
/** The states a read of this kind passes through, in order, ending before `done`. */
export function stagesFor(kind: ReadInput['kind']): ReadState[] {
  void kind
  throw new Error('TODO(ra-e developer): not implemented')
}
/** After 20 s: "Still working… 25 s"; before: null. */
export function elapsedNote(seconds: number): string | null {
  void seconds
  throw new Error('TODO(ra-e developer): not implemented')
}
/** Milliseconds before poll number `attempt` (0-based). */
export function pollDelay(attempt: number): number {
  void attempt
  throw new Error('TODO(ra-e developer): not implemented')
}
/** Milliseconds before retrying after `failures` consecutive failed polls (1-based). */
export function errorBackoff(failures: number): number {
  void failures
  throw new Error('TODO(ra-e developer): not implemented')
}
export function shouldGiveUp(o: { failures: number; elapsedMs: number }): boolean {
  void o
  throw new Error('TODO(ra-e developer): not implemented')
}
