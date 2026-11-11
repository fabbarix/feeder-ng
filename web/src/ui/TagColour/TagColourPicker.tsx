import type { ReactNode } from 'react'
import type { TagColourId } from '../../lib/tags/types'
import type { FieldProps } from '../fields/Field'
import './TagColour.css'

export interface TagColourPickerProps extends Omit<FieldProps, 'name' | 'required'> {
  label: string
  /** The chosen TagColourId; an unknown id leaves nothing checked. */
  value: string
  onChange: (id: TagColourId) => void
  /** A live pill preview, drawn under the swatches (the sheet passes a Chip). */
  preview?: ReactNode
}

/** Ten 40 px swatches in a radiogroup, each named ("Sage"), the chosen one ticked. No Custom swatch, no native colour input. */
export function TagColourPicker(props: TagColourPickerProps): ReactNode {
  void props
  return null // TG-UI stub
}
