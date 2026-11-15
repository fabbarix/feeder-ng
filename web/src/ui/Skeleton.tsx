import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Tile } from './Tile'
import './Skeleton.css'

export type SkeletonVariant = 'tile' | 'row' | 'line' | 'circle' | 'card' | 'hero' | 'title' | 'meta' | 'media'

export interface SkeletonProps {
  variant?: SkeletonVariant
  /** How many blocks. Default 1. */
  count?: number
  /** The shimmer (and the announcement) wait this long. Default 300. The blocks reserve their space from the first frame. */
  delayMs?: number
  /** Announced to screen readers once painted. Default 'Loading'. */
  label?: string
}

/** True once `delayMs` has passed; `null` means "not mine to time" and stays false. */
function useDelayed(delayMs: number | null): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (delayMs === null) return
    const timer = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])
  return shown
}

/** Whether the blocks of the enclosing SkeletonGroup are painted yet (null outside a group). */
const ShownContext = createContext<boolean | null>(null)

export interface SkeletonGroupProps {
  /** Announced to screen readers once painted. Default 'Loading'. */
  label?: string
  /** Default 300. */
  delayMs?: number
  /** A layout class for the group (the screen lays its skeleton out like its content). */
  className?: string
  children: ReactNode
}

/**
 * B9-20 (RES-02): a skeleton in a screen's final shape. One status (aria-busy) around blocks, rows and tiles laid out like
 * the content that replaces them. Every block reserves its space from the first frame (`data-shown="false"`: no fill, no
 * animation); the shimmer and the one announcement wait for `delayMs`, so a quick load never flashes or speaks.
 */
export function SkeletonGroup({ label = 'Loading', delayMs = 300, className, children }: SkeletonGroupProps) {
  const shown = useDelayed(delayMs)
  return (
    <div role="status" aria-busy="true" className={className ? `skeleton-group ${className}` : 'skeleton-group'}>
      {shown ? <span className="visually-hidden">{label}</span> : null}
      <ShownContext.Provider value={shown}>{children}</ShownContext.Provider>
    </div>
  )
}

/** One decorative block. Inside a SkeletonGroup it paints with the group; on its own it waits 300 ms itself. */
export function SkeletonBlock({ variant = 'line' }: { variant?: SkeletonVariant }) {
  const group = useContext(ShownContext)
  const own = useDelayed(group === null ? 300 : null)
  const shown = group ?? own
  return <span className="skeleton" data-variant={variant} data-shown={shown ? 'true' : 'false'} aria-hidden="true" />
}

export interface SkeletonTileProps {
  /** A 16:9 media header, like a `media` Tile's photo. */
  media?: boolean
  className?: string
  children?: ReactNode
}

/** A Tile of skeleton blocks: the same box, padding, gap and media header as the Tile it stands for. */
export function SkeletonTile({ media = false, className, children }: SkeletonTileProps) {
  return (
    <Tile
      variant={media ? 'media' : 'surface'}
      media={media ? <SkeletonBlock variant="media" /> : undefined}
      className={className ? `skeleton-tile ${className}` : 'skeleton-tile'}
      aria-hidden="true"
    >
      {children}
    </Tile>
  )
}

/** A ListRow-shaped skeleton: the 40 px leading thumb, a title and a meta line, at the row's height. */
export function SkeletonRow() {
  return (
    <span className="skeleton-row" aria-hidden="true">
      <SkeletonBlock variant="circle" />
      <span className="skeleton-row__text">
        <SkeletonBlock variant="line" />
        <SkeletonBlock variant="meta" />
      </span>
    </span>
  )
}

/** Rows of a list on one surface, like a ListGroup of ListRows. */
export function SkeletonList({ rows }: { rows: number }) {
  return (
    <span className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </span>
  )
}

/** Placeholder blocks in a column: the simple form of SkeletonGroup. */
export function Skeleton({ variant = 'line', count = 1, delayMs = 300, label = 'Loading' }: SkeletonProps) {
  return (
    <SkeletonGroup label={label} delayMs={delayMs}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} variant={variant} />
      ))}
    </SkeletonGroup>
  )
}
