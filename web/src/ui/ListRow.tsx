import { useId, type ReactNode } from 'react'
import { useHref, useInRouterContext, useLinkClickHandler } from 'react-router-dom'
import { defaultStatusIcon, type ChipStatus } from './Chip'
import { Icon } from './Icon'
import type { IconName } from './icons'
import './ListRow.css'

interface ListRowBase {
  /** Second line (muted). Makes the row two-lined (64) unless a thumb is given (72). A node may mix text and icons on that line. */
  meta?: ReactNode
  /** Tinted 40 px square with this icon, as leading visual. */
  icon?: IconName
  /** Thumb or Avatar as leading visual (wins over `icon`; row height 72). */
  leading?: ReactNode
  /** Right-aligned value (tabular) or one IconButton. */
  trailing?: ReactNode
  /** The value column (system.md 3): end-aligned, tabular, one line, at least --row-value-min wide. Lines up down a list. */
  value?: ReactNode
  /** A second line under `value` (muted, meta size), e.g. a price. */
  subValue?: ReactNode
  /** The leading control, before the picture (a tick, a checkbox). It catches the pointer on its own; the rest of the row is the target. */
  control?: ReactNode
  /** Shows a CaretRight chevron. */
  chevron?: boolean
  selected?: boolean
  /** Lets the title wrap over several lines instead of one truncated line. */
  wrapTitle?: boolean
  /** WP3b: colours the meta line with a status (spoil, leftover, ...); needs `meta`. */
  metaStatus?: ChipStatus
  /** WP3b: icon before the meta text (14 px); defaults to the status icon when `metaStatus` is set. */
  metaIcon?: IconName
  /** WP3b: extra content (e.g. Chips) under the meta line. Makes the row auto-height (`data-height="auto"`). */
  children?: ReactNode
  /** DS-SHOP round 2: the row's target opens a dialog (`aria-haspopup`); set on an `onActivate` target only. */
  haspopup?: 'dialog'
  /**
   * SR4: a full-width strip under the row, inside the same `li` (e.g. the controls of the active row). It catches the pointer
   * on its own, like `panel`; the rest of the row stays the target.
   */
  footer?: ReactNode
  /** Beta.8 (scan, To get): the row is busy (a tick in flight); set on the `li` as aria-busy. */
  'aria-busy'?: 'true'
}

/**
 * Beta.5 (docs/dev/design/b5-d-shared-web.md): an expandable row. `onToggle` makes the whole-row target a disclosure button
 * (`aria-expanded`, `aria-controls` the panel); `panel` is the content that shows when `expanded` (rendered with `hidden`
 * while collapsed, so `aria-controls` always resolves). A toggling row has no `href` or `onActivate`.
 */
type NoDisclosure = { onToggle?: undefined; expanded?: undefined; panel?: undefined }
type Toggle = { onToggle: () => void; expanded: boolean; panel?: ReactNode; href?: never; onActivate?: never }

/** WP3b: `data-*` attributes (e.g. `data-testid`) are passed through to the `li`. */
type DataAttributes = { [K in `data-${string}`]?: string }

/**
 * The row's tap target: `href` or `onActivate`, never both; neither makes a static row.
 *
 * Accessible name: the target is named after `title`. A static row may have a ReactNode title (e.g. inline Recipe links) and
 * needs no name. A row with a target must either have a plain string `title` or an explicit `aria-label`; a ReactNode title
 * without one would leave the target unnamed, so it is a type error.
 */
export type ListRowProps = ListRowBase &
  DataAttributes &
  (
    | (NoDisclosure & { href?: undefined; onActivate?: undefined; title: ReactNode; 'aria-label'?: string })
    | ((NoDisclosure & ({ href: string; onActivate?: never } | { href?: never; onActivate?: () => void })) | Toggle) &
        ({ title: string; 'aria-label'?: string } | { title: ReactNode; 'aria-label': string })
  )

export interface ListGroupProps {
  /** Accessible name of the list. */
  label: string
  children: ReactNode
}

/**
 * A router link that keeps `aria-current` explicit. react-router's `Link` only sets aria-current while its route is
 * active, so a selected row whose href is not the current location would lose it. Same navigation as `Link`.
 */
function RouterTarget({ to, label, current }: { to: string; label: string; current?: 'true' }) {
  const href = useHref(to)
  const onClick = useLinkClickHandler(to)
  return <a className="list-row__target" href={href} onClick={onClick} aria-label={label} aria-current={current} />
}

/** Plain anchor for a row outside a Router (no client-side navigation). */
function PlainTarget({ href, label, current }: { href: string; label: string; current?: 'true' }) {
  return <a className="list-row__target" href={href} aria-label={label} aria-current={current} />
}

/** `data-*` attributes from the row props, for the `li` (never data-height / data-selected / data-wrap-title, which are ours). */
function passthroughData(props: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('data-') && typeof value === 'string' && key !== 'data-height' && key !== 'data-selected' && key !== 'data-wrap-title') out[key] = value
  }
  return out
}

/** A `li`; its whole area is the target through a stretched `<a>`/`<button>` named after `title` (or `aria-label`, required for a ReactNode title on a row with a target). */
export function ListRow(props: ListRowProps) {
  const {
    title,
    meta,
    icon,
    leading,
    trailing,
    value,
    subValue,
    control,
    chevron,
    selected,
    href,
    onActivate,
    onToggle,
    expanded,
    panel,
    children,
    metaStatus,
    metaIcon,
    wrapTitle,
    haspopup,
    footer,
  } = props
  const inRouter = useInRouterContext()
  const panelId = useId()
  const isExpanded = onToggle !== undefined && expanded === true
  // Every row is at least 64 px (72 with a picture) and grows with its title; only an expanded, rich or wrapping row is `auto`.
  const height = isExpanded || children || wrapTitle ? 'auto' : leading ? 72 : 64
  const current = selected ? 'true' : undefined
  const label = props['aria-label'] ?? (typeof title === 'string' ? title : '')
  const metaGlyph: IconName | undefined = metaIcon ?? (metaStatus ? defaultStatusIcon(metaStatus) : undefined)
  let target: ReactNode = null
  if (href !== undefined) {
    target = inRouter ? <RouterTarget to={href} label={label} current={current} /> : <PlainTarget href={href} label={label} current={current} />
  } else if (onToggle) {
    target = (
      <button
        type="button"
        className="list-row__target"
        aria-label={label}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={() => onToggle()}
      />
    )
  } else if (onActivate) {
    target = <button type="button" className="list-row__target" aria-label={label} aria-current={current} aria-haspopup={haspopup} onClick={onActivate} />
  }
  return (
    <li
      {...passthroughData(props as unknown as Record<string, unknown>)}
      aria-busy={props['aria-busy']}
      className="list-row"
      data-height={height}
      data-selected={selected ? 'true' : undefined}
      data-wrap-title={wrapTitle ? 'true' : undefined}
      data-expanded={isExpanded ? 'true' : undefined}
      data-footer={footer ? 'true' : undefined}
    >
      {control ? <span className="list-row__control">{control}</span> : null}
      {target}
      {leading ? (
        <span className="list-row__leading">{leading}</span>
      ) : icon ? (
        <span className="list-row__lead">
          <Icon name={icon} size={24} />
        </span>
      ) : null}
      <span className="list-row__text">
        <span className="list-row__title">{title}</span>
        {meta ? (
          <span className="list-row__meta" data-status={metaStatus}>
            {metaGlyph ? <Icon name={metaGlyph} size={14} /> : null}
            <span className="list-row__meta-text">{meta}</span>
          </span>
        ) : null}
        {children ? <span className="list-row__extra">{children}</span> : null}
      </span>
      {value !== undefined ? (
        <span className="list-row__value">
          {value}
          {subValue !== undefined ? <span className="list-row__sub-value">{subValue}</span> : null}
        </span>
      ) : null}
      {trailing ? <span className="list-row__trailing">{trailing}</span> : null}
      {chevron ? (
        <span className="list-row__chevron">
          <Icon name="chevron" size={20} />
        </span>
      ) : null}
      {footer ? <div className="list-row__footer">{footer}</div> : null}
      {onToggle ? (
        <div id={panelId} className="list-row__panel" hidden={!isExpanded}>
          {panel}
        </div>
      ) : null}
    </li>
  )
}

/** A `ul` inside a surface tile (radius 20, no padding) holding ListRows, with inset dividers. */
export function ListGroup({ label, children }: ListGroupProps) {
  return (
    <div className="list-group" data-primary-scope="">
      <ul className="list-group__list" aria-label={label}>
        {children}
      </ul>
    </div>
  )
}
