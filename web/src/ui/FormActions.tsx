import type { ReactNode } from 'react'
import { Menu, type MenuEntry } from './Menu'
import { formActionsStrings } from './FormActions.strings'
import './FormActions.css'

export interface FormActionsProps {
  /** The one primary Button (submit). Rendered last in the DOM. */
  primary: ReactNode
  /** Optional secondary Button, before the primary. */
  secondary?: ReactNode
  /** Optional Cancel (a secondary Button; DS-12 has no tertiary action), before the secondary. The slot keeps its name until W8. */
  tertiary?: ReactNode
  /**
   * Optional destructive Button (danger-secondary). From 600 px at the far start of the row; below 600 px its own row under a
   * divider (SAFE-02). A caller that wants it inside the ⋮ instead passes a `tone: 'danger'` item in `more`.
   */
  destructive?: ReactNode
  /** SHORT-02: the items of the ⋮ Menu at the start of the row (a popover from 768 px, a sheet below). */
  more?: MenuEntry[]
  /** The ⋮'s accessible name and its sheet's title: "More for Dinner". Default "More actions". */
  moreLabel?: string
}

/** The one action row of pages, sheets and dialogs: one row at every width (SHORT-02). DOM: more, destructive, tertiary, secondary, primary. */
export function FormActions({ primary, secondary, tertiary, destructive, more, moreLabel = formActionsStrings.moreActions }: FormActionsProps) {
  return (
    <div className="form-actions">
      {more && more.length > 0 ? (
        <div className="form-actions__more">
          <Menu label={moreLabel} items={more} />
        </div>
      ) : null}
      {destructive ? <div className="form-actions__destructive">{destructive}</div> : null}
      {tertiary ? <div className="form-actions__tertiary">{tertiary}</div> : null}
      {secondary ? <div className="form-actions__secondary">{secondary}</div> : null}
      <div className="form-actions__primary">{primary}</div>
    </div>
  )
}
