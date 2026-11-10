import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import type { ChipStatus } from './Chip'
import type { IconName } from './icons'
import type { LegacyTileSize, LegacyTileTone } from './lib/legacy'

export type TileVariant = 'surface' | 'hero' | 'soft' | 'status' | 'media' | 'action'
export type TileSpan = 1 | 2 | 'full'
/** @deprecated use `span` and `variant`. */
export type TileSize = LegacyTileSize
/** @deprecated use `variant` (+ `status`). */
export type TileTone = LegacyTileTone

/** The primary target of a clickable Tile. `label` is its accessible name (required). */
export type TileStretched = { label: string } & ({ href: string; onActivate?: never } | { onActivate: () => void; href?: never })

export interface TileProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  /** Default `surface`. `status` needs `status`. */
  variant?: TileVariant
  status?: ChipStatus
  /** Grid columns taken; `full` = whole row. Default 1. */
  span?: TileSpan
  /** Grid rows taken (board only). */
  rowSpan?: 1 | 2 | 3
  /** Small upper-case line above the content, optionally with an icon. */
  overline?: string
  overlineIcon?: IconName
  /** Photo header of a `media` tile (16:9). */
  media?: ReactNode
  /** Full-bleed link or button covering the tile; inner buttons and links still work. Renders `<a>` or `<button>` inside an `<article>`. */
  stretched?: TileStretched
  /** @deprecated use `stretched`. Makes the tile `role="button"` (keyboard operable); never a `<button>`. */
  onClick?: () => void
  /** @deprecated use `span`. */
  size?: TileSize
  /** @deprecated use `variant`. */
  tone?: TileTone
  as?: 'div' | 'section' | 'article'
  className?: string
  children?: ReactNode
  'aria-label'?: string
}

/**
 * STUB (WP3 designer, existing implementation retained so unmigrated screens keep working).
 * Spec: docs/dev/design/wp3-primitives-a.md.
 */
export function Tile({ size = 'md', tone = 'neutral', onClick, as = 'div', className, children, ...rest }: TileProps) {
  const classes = ['tile', className].filter(Boolean).join(' ')
  if (onClick) {
    return (
      <button type="button" className={classes} data-size={size} data-tone={tone} onClick={onClick} {...(rest as object)}>
        {children}
      </button>
    )
  }
  const Tag: ElementType = as
  return (
    <Tag className={classes} data-size={size} data-tone={tone} {...rest}>
      {children}
    </Tag>
  )
}

export interface TileMetricProps {
  /** The big number, e.g. "14", "€38.40". */
  value: string
  /** What it counts, e.g. "left to get". */
  label: string
}

/** STUB. A `display` number with its label, for metric tiles. */
export function TileMetric(_props: TileMetricProps): never {
  throw new Error('not implemented')
}
