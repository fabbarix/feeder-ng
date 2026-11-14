import type { HTMLAttributes, ReactNode } from 'react'

// STUB (B9-02 test author): the developer replaces this with the real primitives (DS-07). It exists only so the tests compile.
export interface StackProps extends HTMLAttributes<HTMLElement> {
  /** Spacing token step: --space-2, --space-3 or --space-4. Default 3. */
  gap?: '2' | '3' | '4'
  /** Default div. */
  as?: 'div' | 'section' | 'ul' | 'ol'
}
export interface ClusterProps extends HTMLAttributes<HTMLElement> {
  /** Spacing token step; only --space-2 exists for a Cluster. */
  gap?: '2'
  as?: 'div' | 'ul' | 'ol'
}

export function Stack(_props: StackProps): ReactNode {
  return null
}
export function Cluster(_props: ClusterProps): ReactNode {
  return null
}
