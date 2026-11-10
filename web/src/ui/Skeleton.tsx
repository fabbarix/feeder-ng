import type { ReactNode } from 'react'

export interface SkeletonProps {
  variant?: 'tile' | 'row' | 'line' | 'circle'
  /** How many blocks. Default 1. */
  count?: number
  /** Nothing is painted until this long has passed. Default 300. */
  delayMs?: number
  /** Announced to screen readers while shown. Default 'Loading'. */
  label?: string
}

/** STUB (WP4 designer). Shimmering placeholder blocks, delayed so quick loads never flash. */
export function Skeleton(_props: SkeletonProps): ReactNode {
  throw new Error('not implemented')
}
