import type { ReactNode } from 'react'

// STUB (B9-02 test author): the developer replaces this with the real primitive (DS-07). It exists only so the tests compile.
export interface SectionTitleProps {
  /** Heading level; default h2. */
  as?: 'h2' | 'h3'
  className?: string
  id?: string
  children: ReactNode
}

export function SectionTitle(_props: SectionTitleProps): ReactNode {
  return null
}
