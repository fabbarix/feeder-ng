import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { uiStrings } from './strings'
import './Breadcrumbs.css'

export interface Crumb {
  label: string
  /** Absent on the current page (the last crumb). */
  to?: string
}
export interface BreadcrumbsProps {
  items: Crumb[]
}

/** The way up a hierarchy: ancestors are links, the last crumb is the current page. Phones show only "‹ Parent". */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null
  const last = items.length - 1
  return (
    <nav aria-label={uiStrings.breadcrumb} className="breadcrumbs">
      <ol className="breadcrumbs__list">
        {items.map((crumb, i) => (
          <li key={`${i}-${crumb.label}`} className="breadcrumbs__item" data-parent={i === last - 1 ? 'true' : undefined}>
            {i < last && crumb.to ? (
              <>
                {i === last - 1 ? <Icon name="chevron" size={14} className="breadcrumbs__back" /> : null}
                <Link className="breadcrumbs__link" to={crumb.to}>
                  {crumb.label}
                </Link>
                <Icon name="chevron" size={14} className="breadcrumbs__sep" />
              </>
            ) : (
              <span className="breadcrumbs__current" aria-current="page">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
