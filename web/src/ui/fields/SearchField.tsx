import type { ReactNode } from 'react'

export interface SearchFieldProps {
  /** Accessible name (also the placeholder when none is given). */
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Enter. */
  onSubmit?: (value: string) => void
  autoFocus?: boolean
}

/** STUB (WP4 designer). The only place <input type="search"> is allowed; styled, with a clear button. */
export function SearchField(_props: SearchFieldProps): ReactNode {
  throw new Error('not implemented')
}
