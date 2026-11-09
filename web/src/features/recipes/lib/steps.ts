import type { StepKind } from '../types'
import { newKey, type StepDraft } from './draft'

/** The part of a Step the ordering helpers care about. Generic so they work on drafts and wire Steps. */
export interface Ordered {
  kind: StepKind
  after: number[]
}

/** Where the Step at old index `i` ends up when the Step at `from` moves to `to`. */
function remapMove(i: number, from: number, to: number): number {
  if (i === from) return to
  if (from < to && i > from && i <= to) return i - 1
  if (from > to && i >= to && i < from) return i + 1
  return i
}

/**
 * Removes the Step at `index`. Every `after` that pointed at it drops that entry; entries pointing
 * past it shift down by one. Returns new arrays/objects; the input is not mutated.
 */
export function removeStep<T extends Ordered>(steps: T[], index: number): T[] {
  return steps
    .filter((_, i) => i !== index)
    .map((s) => ({ ...s, after: s.after.filter((j) => j !== index).map((j) => (j > index ? j - 1 : j)) }))
}

/**
 * Inserts `step` at `index` (0..length). Entries in other Steps' `after` that point at or past the
 * insertion point shift up by one so they keep pointing at the same Steps.
 */
export function insertStep<T extends Ordered>(steps: T[], index: number, step: T): T[] {
  const shifted = steps.map((s) => ({ ...s, after: s.after.map((j) => (j >= index ? j + 1 : j)) }))
  return [...shifted.slice(0, index), step, ...shifted.slice(index)]
}

/**
 * Moves a Step from one position to another. `after` entries are remapped so every dependency still
 * points at the same Step; dependencies that would now point at a later-or-equal position are dropped
 * (a Step may only wait for earlier Steps). Advance Steps never keep an `after`.
 */
export function moveStep<T extends Ordered>(steps: T[], from: number, to: number): T[] {
  if (from === to) return steps.map((s) => ({ ...s }))
  const order = steps.map((_, i) => i)
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved!)
  return order.map((oldIndex, newIndex) => {
    const s = steps[oldIndex]!
    if (s.kind === 'advance') return { ...s, after: [] }
    const after = s.after
      .map((j) => remapMove(j, from, to))
      .filter((j) => j < newIndex)
      .sort((a, b) => a - b)
    return { ...s, after }
  })
}

/**
 * Changes the kind of the Step at `index`. Becoming an Advance Step clears its own `after` and removes
 * it from every other Step's `after` (an Advance Step is outside the timeline).
 */
export function changeKind<T extends Ordered>(steps: T[], index: number, kind: StepKind): T[] {
  return steps.map((s, i) => {
    if (i === index) return kind === 'advance' ? { ...s, kind, after: [] } : { ...s, kind }
    if (kind === 'advance') return { ...s, after: s.after.filter((j) => j !== index) }
    return { ...s }
  })
}

/** Indexes the Step at `index` may wait for: earlier Steps that are not Advance Steps. Empty for an Advance Step. */
export function afterOptions(steps: Ordered[], index: number): number[] {
  if (steps[index]?.kind === 'advance') return []
  const out: number[] = []
  for (let j = 0; j < index; j++) if (steps[j]!.kind !== 'advance') out.push(j)
  return out
}

/** A new blank Step: kind 'active', empty texts/durations, no after, no uses, no image, fresh key. */
export function newStepDraft(): StepDraft {
  return { key: newKey('step'), text: '', kind: 'active', durationMinutes: '', leadTimeMinutes: '', after: [], uses: [], image: '' }
}

/**
 * Adds (`on`) or removes dependency `j` in the `after` of the Step at `i`: no duplicates, sorted ascending.
 * Returns new arrays; other Steps are untouched (same objects).
 */
export function toggleAfter<T extends Ordered>(steps: T[], i: number, j: number, on: boolean): T[] {
  return steps.map((s, k) => {
    if (k !== i) return s
    const after = on ? [...new Set([...s.after, j])].sort((a, b) => a - b) : s.after.filter((x) => x !== j)
    return { ...s, after }
  })
}
