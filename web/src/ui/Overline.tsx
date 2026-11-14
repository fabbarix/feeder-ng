import type { ReactNode } from 'react'

// STUB (B9-02 test author): the developer replaces this with the real primitive (DS-07). It exists only so the tests compile.
export interface OverlineProps {
  /** Default p. */
  as?: 'p' | 'span'
  className?: string
  id?: string
  children: ReactNode
}

export function Overline(_props: OverlineProps): ReactNode {
  return null
}
