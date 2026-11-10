import type { ReactNode } from 'react'

export interface ErrorStateProps {
  /** e.g. "The plan could not be loaded." */
  message: string
  onRetry?: () => void
  /** Default 'Try again'. */
  retryLabel?: string
}

/** STUB (WP4 designer). Inline danger status tile with role=alert and an optional retry button. */
export function ErrorState(_props: ErrorStateProps): ReactNode {
  throw new Error('not implemented')
}
