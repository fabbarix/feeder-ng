import type { ElementType, HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import type { ChipStatus } from './Chip'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { resolveTile, type LegacyTileSize, type LegacyTileTone } from './lib/legacy'
import './Tile.css'

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
  overline?: ReactNode
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
 * A layout container, never a `<button>` (docs/design/ui-fix-plan.md 4.4). Height is its content; tiles in one
 * Bento row stretch to the tallest. A stretched tile is an `<article>` whose primary target covers it.
 */
export function Tile({
  variant,
  status,
  span,
  rowSpan,
  overline,
  overlineIcon,
  media,
  stretched,
  onClick,
  size,
  tone,
  as = 'div',
  className,
  children,
  ...rest
}: TileProps) {
  const resolved = resolveTile({ variant, status, span, tone, size })
  const Tag: ElementType = stretched ? 'article' : onClick ? 'div' : as
  const onKeyDown = onClick
    ? (e: KeyboardEvent<HTMLElement>) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }
    : undefined

  const body = (
    <>
      {media ? <div className="tile__media">{media}</div> : null}
      {overline ? (
        <p className="tile__overline">
          {overlineIcon ? <Icon name={overlineIcon} size={16} /> : null}
          {overline}
        </p>
      ) : null}
      {children}
    </>
  )

  let stretch: ReactNode = null
  if (stretched) {
    stretch = stretched.href ? (
      <a className="tile__stretch" href={stretched.href} aria-label={stretched.label} />
    ) : (
      <button type="button" className="tile__stretch" aria-label={stretched.label} onClick={stretched.onActivate} />
    )
  }

  return (
    <Tag
      {...rest}
      className={['tile', className].filter(Boolean).join(' ')}
      data-variant={resolved.variant}
      data-status={resolved.status}
      data-span={resolved.span}
      data-row-span={rowSpan}
      data-tone={tone ?? (rest as Record<string, unknown>)['data-tone']}
      data-size={size}
      data-primary-scope=""
      role={onClick ? (rest.role ?? 'button') : rest.role}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {body}
      {stretch}
    </Tag>
  )
}

export interface TileMetricProps {
  /** The big number, e.g. "14", "€38.40". */
  value: string
  /** What it counts, e.g. "left to get". */
  label: string
}

/** A `display` number with its label, for metric tiles. */
export function TileMetric({ value, label }: TileMetricProps) {
  return (
    <span className="tile-metric">
      <span className="tile-metric__value">{value}</span>
      <span className="tile-metric__label">{label}</span>
    </span>
  )
}
