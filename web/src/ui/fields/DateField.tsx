import type { ReactNode } from 'react'
import type { FieldProps } from './Field'

export interface DateFieldProps extends FieldProps {
  /** ISO "YYYY-MM-DD" or "". */
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  /** BCP 47 tag for month/weekday names and the field text. Default 'en-GB' (weeks always start Monday). */
  locale?: string
  /** ISO date treated as today (aria-current, initial month when empty). Default: the real today. */
  today?: string
  placeholder?: string
}

/** STUB (WP4 designer). Trigger button + calendar popover (role=dialog, grid of day buttons). */
export function DateField(_props: DateFieldProps): ReactNode {
  throw new Error('not implemented')
}
