import type { ReactNode } from 'react'

export interface SwitchProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
  disabled?: boolean
}

/** STUB (WP4 designer). A button role=switch, 52x32. */
export function Switch(_props: SwitchProps): ReactNode {
  throw new Error('not implemented')
}
