import { useEffect, useState } from 'react'
import './Skeleton.css'

export interface SkeletonProps {
  variant?: 'tile' | 'row' | 'line' | 'circle' | 'card' | 'hero' | 'title' | 'meta'
  /** How many blocks. Default 1. */
  count?: number
  /** The shimmer (and the announcement) wait this long. Default 300. The blocks reserve their space from the first frame. */
  delayMs?: number
  /** Announced to screen readers once painted. Default 'Loading'. */
  label?: string
}

/**
 * Placeholder blocks in the final shape. B9-20 (RES-02): every block is rendered from the first frame with
 * `data-shown="false"` (no fill, no animation), so its space is reserved and nothing moves; after `delayMs` the same blocks
 * shimmer and the one status is announced, so a quick load never flashes or speaks.
 */
export function Skeleton({ variant = 'line', count = 1, delayMs = 300, label = 'Loading' }: SkeletonProps) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])
  return (
    <div role="status" aria-busy="true" className="skeleton-group">
      {shown ? <span className="visually-hidden">{label}</span> : null}
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="skeleton" data-variant={variant} data-shown={shown ? 'true' : 'false'} aria-hidden="true" />
      ))}
    </div>
  )
}
