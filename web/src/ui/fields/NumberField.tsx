import type { ReactNode } from 'react'
import type { FieldProps } from './Field'

export interface NumberFieldProps extends FieldProps {
  value: number | null
  /** Fires on commit (blur, Enter, arrows, ± buttons), never per keystroke. null = emptied. */
  onChange: (value: number | null) => void
  min?: number
  max?: number
  /** Default 1. */
  step?: number
  /** Suffix shown after the number, e.g. "g". */
  unit?: string
  /** Hide the ± buttons. */
  hideStepper?: boolean
}

/** STUB (WP4 designer). A text input (inputmode=decimal, role=spinbutton), never <input type=number>. */
export function NumberField(_props: NumberFieldProps): ReactNode {
  throw new Error('not implemented')
}
