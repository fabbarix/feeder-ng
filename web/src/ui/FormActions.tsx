import type { ReactNode } from 'react'
import type { MenuEntry } from './Menu'
import './FormActions.css'

export interface FormActionsProps {
  /** The one primary Button (submit). Rendered last in the DOM. */
  primary: ReactNode
  /** Optional secondary Button, before the primary. */
  secondary?: ReactNode
  /** Optional Cancel (a secondary Button; DS-12 has no tertiary action), before the secondary. The slot keeps its name until B9-14. */
  tertiary?: ReactNode
  /** Optional destructive Button (danger-secondary), first in the DOM and at the far left from 600 px. */
  destructive?: ReactNode
  /** B9-14 STUB (types only): items of the ⋮ Menu at the start of the row. */
  more?: MenuEntry[]
  /** B9-14 STUB: the ⋮'s accessible name ("More for Dinner"). Default "More actions". */
  moreLabel?: string
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
