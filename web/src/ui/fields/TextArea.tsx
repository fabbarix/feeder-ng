import type { ReactNode } from 'react'
import type { FieldProps } from './Field'

export interface TextAreaProps extends FieldProps {
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  maxLength?: number
}

/** STUB (WP4 designer). */
export function TextArea(_props: TextAreaProps): ReactNode {
  throw new Error('not implemented')
}
