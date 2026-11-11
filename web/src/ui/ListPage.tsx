import type { ReactNode } from 'react'
import './ListPage.css'

export interface ListPageProps {
  /** The title row, a PageHeader. Always rendered. */
  header: ReactNode
  /** The SearchField. Its slot is omitted when not given. */
  search?: ReactNode
  /** Filter chips (Chip kind="filter", TagChips). Its slot is omitted when not given. */
  filters?: ReactNode
  /** The list, or its EmptyState, error or status line. */
  children: ReactNode
  /** An optional screen scope class, added next to list-page on the root. */
  className?: string
}

/**
 * IH: the shared root of every list screen. Header, search, filters and list sit in their own slots,
 * separated by one token gap, so the search never touches the list.
 */
export function ListPage({ header, search, filters, children, className }: ListPageProps) {
  const rootClass = className ? `list-page ${className}` : 'list-page'
  return (
    <div className={rootClass}>
      <div className="list-page__header">{header}</div>
      {search ? <div className="list-page__search">{search}</div> : null}
      {filters ? <div className="list-page__filters">{filters}</div> : null}
      <div className="list-page__list">{children}</div>
    </div>
  )
}
