import type { ReactNode } from 'react'

export interface CheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
  /** Renders the mixed state (aria-checked=mixed); clicking still reports onChange(!checked). */
  indeterminate?: boolean
  disabled?: boolean
  name?: string
}

/** STUB (WP4 designer). A visually hidden native checkbox plus a 22 px drawn box. */
export function Checkbox(_props: CheckboxProps): ReactNode {
  throw new Error('not implemented')
}
