import type { ReactNode } from 'react'
import type { FieldProps } from './Field'

export interface TimeFieldProps extends FieldProps {
  /** "HH:mm" (24 h) or "". */
  value: string
  onChange: (value: string) => void
  /** Arrow step for the minute segment. Default 1. */
  minuteStep?: number
}

/** STUB (WP4 designer). Two spinbutton segments (Hour, Minute) in a role=group; no AM/PM, no <input type=time>. */
export function TimeField(_props: TimeFieldProps): ReactNode {
  throw new Error('not implemented')
}
