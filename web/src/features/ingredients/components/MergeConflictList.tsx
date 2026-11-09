import type { BaseUnit, UnitSystem } from '../../../lib/units'
import type { Answers } from '../lib/mergeResolution'
import type { Conflict } from '../types'

export interface MergeConflictListProps {
  conflicts: readonly Conflict[]
  base: BaseUnit
  system: UnitSystem
  answers: Answers
  onAnswer: (key: string, value: number | null) => void
}

/**
 * One radio group per conflict. A conversion conflict is titled strings.mergeConflictConversion(unit)
 * with two options "Keep <formatQuantity of source>" and "Keep <… of target>" (equal values are not conflicts).
 * The Shelf Life conflict offers "Keep N days" for both sides plus "Keep no Shelf Life" (answer null).
 * Nothing is preselected.
 */
export function MergeConflictList(props: MergeConflictListProps) {
  void props
  return null
}
