import { useEffect, useState } from 'react'
import './Skeleton.css'

export interface SkeletonProps {
  variant?: 'tile' | 'row' | 'line' | 'circle'
  /** How many blocks. Default 1. */
  count?: number
  /** Nothing is painted until this long has passed. Default 300. */
  delayMs?: number
  /** Announced to screen readers while shown. Default 'Loading'. */
  label?: string
}

/** Shimmering placeholder blocks, delayed so quick loads never flash. The blocks are decorative; one status announces the wait. */
export function Skeleton({ variant = 'line', count = 1, delayMs = 300, label = 'Loading' }: SkeletonProps) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])
  if (!shown) return null
  return (
    <div role="status" aria-busy="true" className="skeleton-group">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="skeleton" data-variant={variant} aria-hidden="true" />
      ))}
    </div>
  )
}
