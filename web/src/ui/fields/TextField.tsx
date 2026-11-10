import type { ReactNode } from 'react'
import type { FieldProps, IconName } from './Field'

export interface TextFieldProps extends FieldProps {
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'url' | 'password' | 'tel'
  placeholder?: string
  autoComplete?: string
  inputMode?: 'text' | 'email' | 'url' | 'tel' | 'numeric' | 'decimal'
  maxLength?: number
  leadingIcon?: IconName
  /** Muted text after the value, e.g. a unit. */
  suffix?: string
}

/** STUB (WP4 designer). */
export function TextField(_props: TextFieldProps): ReactNode {
  throw new Error('not implemented')
}
