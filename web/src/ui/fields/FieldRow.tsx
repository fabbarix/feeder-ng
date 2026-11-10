import type { ReactNode } from 'react'

export interface FieldRowProps {
  children: ReactNode
  /** Accessible name of the row as a group (optional; a row of related fields such as "Item code"). */
  label?: string
  /** 'end' aligns a trailing Button with the controls, not the labels. Default 'start'. */
  align?: 'start' | 'end'
}

/** Several short fields on one row, wrapping on phones. Type-only stub: the Developer step implements it. */
export function FieldRow(_props: FieldRowProps) {
  return <div />
}
