import type { ReactNode } from 'react'
import type { IconName } from './icons'

interface ListRowBase {
  title: string
  /** Second line (muted). Makes the row two-lined (64) unless a thumb is given (72). */
  meta?: string
  /** Tinted 40 px square with this icon, as leading visual. */
  icon?: IconName
  /** Thumb or Avatar as leading visual (wins over `icon`; row height 72). */
  leading?: ReactNode
  /** Right-aligned value (tabular) or one IconButton. */
  trailing?: ReactNode
  /** Shows a CaretRight chevron. */
  chevron?: boolean
  selected?: boolean
}

/** The row's tap target: `href` or `onActivate`, never both; neither makes a static row. */
export type ListRowProps = ListRowBase & ({ href?: string; onActivate?: never } | { href?: never; onActivate?: () => void })

export interface ListGroupProps {
  /** Accessible name of the list. */
  label: string
  children: ReactNode
}

/** STUB (WP3 designer). A `li`; its whole area is the target through a stretched `<a>`/`<button>` named after `title`. */
export function ListRow(_props: ListRowProps): never {
  throw new Error('not implemented')
}

/** STUB. A `ul` inside a surface tile (radius 20, no padding) holding ListRows, with inset dividers. */
export function ListGroup(_props: ListGroupProps): never {
  throw new Error('not implemented')
}
