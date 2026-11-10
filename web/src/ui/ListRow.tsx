import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import './ListRow.css'

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

/** A `li`; its whole area is the target through a stretched `<a>`/`<button>` named after `title`. */
export function ListRow({ title, meta, icon, leading, trailing, chevron, selected, href, onActivate }: ListRowProps) {
  const height = leading ? 72 : meta ? 64 : 56
  const current = selected ? 'true' : undefined
  const label = title
  let target: ReactNode = null
  if (href !== undefined) {
    target = <a className="list-row__target" href={href} aria-label={label} aria-current={current} />
  } else if (onActivate) {
    target = <button type="button" className="list-row__target" aria-label={label} aria-current={current} onClick={onActivate} />
  }
  return (
    <li className="list-row" data-height={height} data-selected={selected ? 'true' : undefined}>
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
        {meta ? <span className="list-row__meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="list-row__trailing">{trailing}</span> : null}
      {chevron ? (
        <span className="list-row__chevron">
          <Icon name="chevron" size={20} />
        </span>
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
