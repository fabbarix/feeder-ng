import type { ReactNode } from 'react'
import './FormActions.css'

export interface FormActionsProps {
  /** The one primary Button (submit). Rendered last in the DOM. */
  primary: ReactNode
  /** Optional secondary Button, before the primary. */
  secondary?: ReactNode
  /** Optional tertiary Button (Cancel), before the secondary. */
  tertiary?: ReactNode
  /** Optional destructive Button (danger-tertiary), first in the DOM and at the far left from 600 px. */
  destructive?: ReactNode
}

/** Consistent action row for pages, sheets and dialogs. */
export function FormActions({ primary, secondary, tertiary, destructive }: FormActionsProps) {
  return (
    <div className="form-actions">
      {destructive ? <div className="form-actions__destructive">{destructive}</div> : null}
      {tertiary ? <div className="form-actions__tertiary">{tertiary}</div> : null}
      {secondary ? <div className="form-actions__secondary">{secondary}</div> : null}
      <div className="form-actions__primary">{primary}</div>
    </div>
  )
}
