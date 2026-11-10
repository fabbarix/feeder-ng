import type { ReactNode } from 'react'

export interface PageErrorBoundaryProps {
  children: ReactNode
  /** The boundary resets when this changes (the pathname), so navigating away from a broken page recovers. */
  resetKey: string
}

/** STUB (WP5 designer). React error boundary around the shell's Outlet; the bars stay usable. Fallback is `ErrorPage`. */
export function PageErrorBoundary(_props: PageErrorBoundaryProps): ReactNode {
  throw new Error('not implemented')
}

/** STUB (WP5 designer). Router `errorElement` for the root route: the same fallback, outside the shell. */
export function RouteErrorBoundary(): null {
  throw new Error('not implemented')
}
