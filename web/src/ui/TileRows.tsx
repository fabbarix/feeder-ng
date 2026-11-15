import type { FocusEventHandler, HTMLAttributes, ReactNode } from 'react'
import './TileRows.css'

export interface TileRowsProps {
  className?: string
  /** For a list that moves focus when a row goes (useRowFocusAfterRemoval). */
  onFocus?: FocusEventHandler<HTMLUListElement>
  children: ReactNode
}

/**
 * B9-44 (TB-11): the list of rows inside a tile (Today's Use soon, Leftovers and Advance Steps): a real `ul` with no bullets and no
 * inset of its own, so the rows (ListRows, or a tile's own `TileRow`s) take the tile's padding and are announced as a list.
 */
export function TileRows({ className, onFocus, children }: TileRowsProps) {
  return (
    <ul className={className ? `tile-rows ${className}` : 'tile-rows'} onFocus={onFocus}>
      {children}
    </ul>
  )
}

/** One row of a TileRows that is not a ListRow (its own anatomy); `data-*` attributes pass through. */
export function TileRow({ children, ...rest }: HTMLAttributes<HTMLLIElement> & { [k: `data-${string}`]: string | undefined }) {
  return <li {...rest}>{children}</li>
}
