import type { ReactNode } from 'react'
import type { UnitPrompt } from '../types'

export interface UnitPromptTileProps {
  prompt: UnitPrompt
  onAnswer: (toBase: number) => void
}

/**
 * importStrings.unitPrompt(unit, ingredient) with a number field labelled importStrings.unitAmountLabel(base) and a Save button.
 * Typed text goes through lib/decisions.parseToBase: invalid input shows importStrings.conversionInvalid and keeps Save disabled.
 * An answered prompt shows its value ("= 30 g") and keeps the field editable.
 */
export function UnitPromptTile(props: UnitPromptTileProps): ReactNode {
  void props
  throw new Error('not implemented')
}
