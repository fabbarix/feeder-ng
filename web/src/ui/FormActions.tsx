import type { ReactNode } from 'react'

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

/** Consistent action row for pages, sheets and dialogs. Type-only stub: the Developer step implements it. */
export function FormActions(_props: FormActionsProps) {
  return <div />
}
