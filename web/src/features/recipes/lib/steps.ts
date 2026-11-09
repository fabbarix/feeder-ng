import type { StepKind } from '../types'

/** The part of a Step the ordering helpers care about. Generic so they work on drafts and wire Steps. */
export interface Ordered {
  kind: StepKind
  after: number[]
}

/**
 * Removes the Step at `index`. Every `after` that pointed at it drops that entry; entries pointing
 * past it shift down by one. Returns new arrays/objects; the input is not mutated.
 */
export function removeStep<T extends Ordered>(_steps: T[], _index: number): T[] {
  throw new Error('TODO')
}

/**
 * Inserts `step` at `index` (0..length). Entries in other Steps' `after` that point at or past the
 * insertion point shift up by one so they keep pointing at the same Steps.
 */
export function insertStep<T extends Ordered>(_steps: T[], _index: number, _step: T): T[] {
  throw new Error('TODO')
}

/**
 * Moves a Step from one position to another. `after` entries are remapped so every dependency still
 * points at the same Step; dependencies that would now point at a later-or-equal position are dropped
 * (a Step may only wait for earlier Steps). Advance Steps never keep an `after`.
 */
export function moveStep<T extends Ordered>(_steps: T[], _from: number, _to: number): T[] {
  throw new Error('TODO')
}

/**
 * Changes the kind of the Step at `index`. Becoming an Advance Step clears its own `after` and removes
 * it from every other Step's `after` (an Advance Step is outside the timeline).
 */
export function changeKind<T extends Ordered>(_steps: T[], _index: number, _kind: StepKind): T[] {
  throw new Error('TODO')
}

/** Indexes the Step at `index` may wait for: earlier Steps that are not Advance Steps. Empty for an Advance Step. */
export function afterOptions(_steps: Ordered[], _index: number): number[] {
  throw new Error('TODO')
}
