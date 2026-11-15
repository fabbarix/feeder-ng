import type { ReactNode } from 'react'
import './FieldRow.css'

export interface FieldRowProps {
  children: ReactNode
  /** Accessible name of the row as a group (optional; a row of related fields such as "Item code"). */
  label?: string
  /** B9-30: the id of a visible label that names the row as a group (instead of `label`), so the name is said once. */
  labelledBy?: string
  /** 'end' aligns a trailing Button with the controls, not the labels. Default 'start'. */
  align?: 'start' | 'end'
  /** Extra class for the row (a feature's own hook for spacing or alignment). */
  className?: string
}

/** Several short fields on one row, wrapping on phones. */
export function FieldRow({ children, label, labelledBy, align = 'start', className }: FieldRowProps) {
  return (
    <div
      className={['field-row', className].filter(Boolean).join(' ')}
      role={label || labelledBy ? 'group' : undefined}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      data-align={align === 'end' ? 'end' : undefined}
    >
      {children}
    </div>
  )
}
