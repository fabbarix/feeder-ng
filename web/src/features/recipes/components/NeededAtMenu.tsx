import type { ReactNode } from 'react'
import type { RecipeStep } from '../types'

export interface NeededAtMenuProps {
  steps: ReadonlyArray<Pick<RecipeStep, 'text' | 'kind'>>
  /** The Step that applies now (the override or the default), 0-based. */
  value: number
  /** The default Step, marked "(default)"; null = unknown (no mark). */
  defaultStep: number | null
  /** The Base recipe line's name, for the accessible name. */
  lineName: string
  /** A Step index = override; null = back to the default. */
  onChange: (step: number | null) => void
}

/** BR-D: the Needed at chip-menu of a Base recipe line: a Menu whose trigger reads "Needed at Step 4" / "Before you start" and lists neededAtOptions. */
export function NeededAtMenu(props: NeededAtMenuProps): ReactNode {
  void props
  return null
}
