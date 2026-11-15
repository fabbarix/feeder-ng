// B9-20 (RES-02): STUB for the tests; the developer builds it.
import type { ReactNode } from 'react'

export interface LoadStateProps {
  title: string
  text: string
  /** default "Waiting for a connection" */
  status?: string
  in?: 'page' | 'tile'
  headingLevel?: 2 | 3
}
export function LoadState(_props: LoadStateProps): ReactNode {
  return null
}
