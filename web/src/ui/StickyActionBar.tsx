import type { ReactNode } from 'react'
import './StickyActionBar.css'

export interface StickyActionBarProps {
  /** Usually a FormActions row. */
  children: ReactNode
  /** Accessible name of the group (default "Actions"). */
  label?: string
  /** Where the inner row aligns: the whole Page column (default) or the narrow form column. */
  column?: 'page' | 'narrow'
}

/** STUB (R2-L red tests). */
export function StickyActionBar({ children }: StickyActionBarProps) {
  return <div>{children}</div>
}
