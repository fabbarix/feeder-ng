import { useId, type ReactNode } from 'react'
import { useHref, useInRouterContext, useLinkClickHandler } from 'react-router-dom'
import { defaultStatusIcon, type ChipStatus } from './Chip'
import { Icon } from './Icon'
import type { IconName } from './icons'
import './fields/Field.css' // the shared .visually-hidden utility (a ListGroup's spelled-out count)
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
  /**
   * Beta.8: the row's action is in flight (like Button's `loading`): the `li` is `aria-busy` and an `onActivate` target stays
   * in place but is disabled, so a second tap does nothing and the row keeps its spot in the tab order.
   */
  busy?: boolean
  /** A11Y-08: ids of elements that also describe the target (merged before the row's own value, sub-value and meta ids). */
  'aria-describedby'?: string
  /** DS-10: 2 lets the meta of a navigation row (with `href`) take two lines, then an ellipsis. Ignored on any other row. */
  metaLines?: 1 | 2
  /** SSP-05: the short form of `meta`, shown while the row's text column is under 12 rem; the long `meta` stays the accessible text. */
  metaCompact?: ReactNode
  /** SET-03: controls that belong to the row but are not an ActionGroup (a Switch, two IconButtons, Deny/Approve). */
  actions?: ReactNode
  /** PC-06: a line under the whole row (title and icon set), e.g. the Plan row's chips. Renders nothing when empty. */
  below?: ReactNode
  /** RES-03: the row's Tick or Scan is waiting to sync (clock badge, muted meta) or was refused on sync (danger meta, inset bar). */
  sync?: 'pending' | 'failed'
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
  /** Accessible name of the list (assistive technology only). Required unless `title` is given. */
  label?: string
  /** SSP-03: a visible group heading (an `h2`); it names the list. */
  title?: string
  /** SSP-03: the number in the count chip after the title. */
  count?: number
  /** SSP-03: the count spelled out for assistive technology, e.g. `(n) => `${n} Stock Lots``. */
  countLabel?: (n: number) => string
  /** SSP-03: a decorative kind icon before the title. */
  icon?: IconName
  /** SSP-03: one action at the end of the heading row (e.g. Put away). */
  action?: ReactNode
  children: ReactNode
}

/**
 * A router link that keeps `aria-current` explicit. react-router's `Link` only sets aria-current while its route is
 * active, so a selected row whose href is not the current location would lose it. Same navigation as `Link`.
 */
function RouterTarget({ to, label, current, describedBy }: { to: string; label: string; current?: 'true'; describedBy?: string }) {
  const href = useHref(to)
  const onClick = useLinkClickHandler(to)
  return <a className="list-row__target" href={href} onClick={onClick} aria-label={label} aria-describedby={describedBy} aria-current={current} />
}

/** Plain anchor for a row outside a Router (no client-side navigation). */
function PlainTarget({ href, label, current, describedBy }: { href: string; label: string; current?: 'true'; describedBy?: string }) {
  return <a className="list-row__target" href={href} aria-label={label} aria-describedby={describedBy} aria-current={current} />
}

/** The `data-*` attributes the row writes itself. */
const OWN_DATA = new Set(['data-height', 'data-selected', 'data-wrap-title', 'data-expanded', 'data-footer', 'data-meta-lines', 'data-actions', 'data-has-below', 'data-sync'])

/** `data-*` attributes from the row props, for the `li` (never the ones in OWN_DATA, which the row writes). */
function passthroughData(props: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('data-') && typeof value === 'string' && !OWN_DATA.has(key)) out[key] = value
  }
  return out
}

/** True when a slot has something to render: not null, undefined, false or an empty string. */
function filled(node: ReactNode): boolean {
  return node !== null && node !== undefined && node !== false && node !== ''
}

/** The meta glyph: an explicit `metaIcon` wins, then the sync state's (Clock waiting, WarningCircle refused), then the status's. */
function metaGlyphFor(metaIcon: IconName | undefined, sync: ListRowBase['sync'], status: ChipStatus | undefined): IconName | undefined {
  if (metaIcon) return metaIcon
  if (sync === 'pending') return 'duration'
  if (sync === 'failed') return 'spoiled'
  return status ? defaultStatusIcon(status) : undefined
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
    busy,
    metaLines,
    metaCompact,
    actions,
    below,
    sync,
  } = props
  const inRouter = useInRouterContext()
  const panelId = useId()
  const valueId = useId()
  const subValueId = useId()
  const metaId = useId()
  const isExpanded = onToggle !== undefined && expanded === true
  // Every row is at least 64 px (72 with a picture) and grows with its title; only an expanded, rich or wrapping row is `auto`.
  const height = isExpanded || children || wrapTitle ? 'auto' : leading ? 72 : 64
  const current = selected ? 'true' : undefined
  const label = props['aria-label'] ?? (typeof title === 'string' ? title : '')
  // RES-03: a refused sync is a loss (danger); a waiting one is muted, with no status.
  const status: ChipStatus | undefined = sync === 'failed' ? 'danger' : sync === 'pending' ? undefined : metaStatus
  const metaGlyph = metaGlyphFor(metaIcon, sync, status)
  const hasValue = value !== undefined
  const hasSubValue = hasValue && subValue !== undefined
  const hasMeta = Boolean(meta)
  const hasActions = filled(actions)
  const hasBelow = filled(below)
  // A11Y-08: the target is named by the title and described by the value, sub-value and meta (in reading order), after the caller's ids.
  const describedBy =
    [props['aria-describedby'], hasValue ? valueId : '', hasSubValue ? subValueId : '', hasMeta ? metaId : ''].filter(Boolean).join(' ') || undefined
  // DS-10: only a navigation row may take a two-line description; a status row keeps its one line.
  const metaTwoLines = metaLines === 2 && href !== undefined
  let target: ReactNode = null
  if (href !== undefined) {
    target = inRouter ? (
      <RouterTarget to={href} label={label} current={current} describedBy={describedBy} />
    ) : (
      <PlainTarget href={href} label={label} current={current} describedBy={describedBy} />
    )
  } else if (onToggle) {
    target = (
      <button
        type="button"
        className="list-row__target"
        aria-label={label}
        aria-describedby={describedBy}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={() => onToggle()}
      />
    )
  } else if (onActivate) {
    target = (
      <button
        type="button"
        className="list-row__target"
        aria-label={label}
        aria-describedby={describedBy}
        aria-current={current}
        aria-haspopup={haspopup}
        disabled={busy || undefined}
        onClick={onActivate}
      />
    )
  }
  return (
    <li
      {...passthroughData(props as unknown as Record<string, unknown>)}
      aria-busy={busy ? true : undefined}
      className="list-row"
      data-height={height}
      data-selected={selected ? 'true' : undefined}
      data-wrap-title={wrapTitle ? 'true' : undefined}
      data-expanded={isExpanded ? 'true' : undefined}
      data-footer={footer ? 'true' : undefined}
      data-meta-lines={metaTwoLines ? '2' : undefined}
      data-actions={hasActions ? 'true' : undefined}
      data-has-below={hasBelow ? 'true' : undefined}
      data-sync={sync}
    >
      {control ? (
        <span className="list-row__control">
          {control}
          {sync === 'pending' ? (
            <span className="list-row__sync-badge" aria-hidden="true">
              <Icon name="duration" size={14} />
            </span>
          ) : null}
        </span>
      ) : null}
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
        {hasMeta ? (
          <span id={metaId} className="list-row__meta" data-status={status} data-tone={sync === 'pending' ? 'pending' : undefined}>
            {metaGlyph ? <Icon name={metaGlyph} size={14} /> : null}
            <span className="list-row__meta-text">{meta}</span>
            {filled(metaCompact) ? (
              <span className="list-row__meta-compact" aria-hidden="true">
                {metaCompact}
              </span>
            ) : null}
          </span>
        ) : null}
        {children ? <span className="list-row__extra">{children}</span> : null}
      </span>
      {hasValue ? (
        <span id={valueId} className="list-row__value">
          {value}
          {/* aria-hidden keeps the sub-value out of the value's own text in the description; its id still reads it, once, after it. */}
          {hasSubValue ? (
            <span id={subValueId} className="list-row__sub-value" aria-hidden="true">
              {subValue}
            </span>
          ) : null}
        </span>
      ) : null}
      {trailing ? <span className="list-row__trailing">{trailing}</span> : null}
      {chevron ? (
        <span className="list-row__chevron">
          <Icon name="chevron" size={20} />
        </span>
      ) : null}
      {hasActions ? <div className="list-row__actions">{actions}</div> : null}
      {hasBelow ? <div className="list-row__below">{below}</div> : null}
      {footer ? <div className="list-row__footer">{footer}</div> : null}
      {onToggle ? (
        <div id={panelId} className="list-row__panel" hidden={!isExpanded}>
          {panel}
        </div>
      ) : null}
    </li>
  )
}

/**
 * A `ul` inside a surface tile (radius 20, no padding) holding ListRows, with inset dividers.
 *
 * SSP-03: a group named for a person to see has a `title`: a visible `h2` heading row (icon, name, count chip, one action) that
 * names the list. `label` names a list for assistive technology only, for a list whose heading is already on screen right
 * above it (a tile or section title). `title` wins over `label`.
 */
export function ListGroup({ label, title, count, countLabel, icon, action, children }: ListGroupProps) {
  const headingId = useId()
  if (title === undefined || title === '') {
    return (
      <div className="list-group" data-primary-scope="">
        <ul className="list-group__list" aria-label={label}>
          {children}
        </ul>
      </div>
    )
  }
  return (
    <section className="list-group-section">
      <div className="list-group__header">
        <h2 className="list-group__title" id={headingId}>
          {icon ? (
            <span className="list-group__icon">
              <Icon name={icon} size={20} />
            </span>
          ) : null}
          <span className="list-group__name">{title}</span>
          {/* A space for the accessible name ("Kitchen Fridge 5 Stock Lots"); the flex heading does not render it. */}{' '}
          {count !== undefined ? (
            <span className="list-group__count">
              {countLabel ? (
                <>
                  <span aria-hidden="true">{count}</span>
                  <span className="visually-hidden">{countLabel(count)}</span>
                </>
              ) : (
                count
              )}
            </span>
          ) : null}
        </h2>
        {action ? <div className="list-group__action">{action}</div> : null}
      </div>
      <div className="list-group" data-primary-scope="">
        <ul className="list-group__list" aria-labelledby={headingId}>
          {children}
        </ul>
      </div>
    </section>
  )
}
