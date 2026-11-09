import type { ReactNode } from 'react'
import type { UnitPrompt } from '../lib/unitPrompt'

export interface UnitConversionPromptProps {
  prompt: UnitPrompt
  onSave: (toBase: number) => void
  onCancel: () => void
}

/**
 * The inline Unit Conversion prompt of the Recipe editor (a ui/BottomSheet): the question from
 * promptQuestion, one number field labelled "Amount in <base unit>", Save and Cancel. A value
 * parseToBase rejects shows strings.unitConversion.invalid and does not call onSave.
 */
export function UnitConversionPrompt(_props: UnitConversionPromptProps): ReactNode {
  throw new Error('TODO')
}
