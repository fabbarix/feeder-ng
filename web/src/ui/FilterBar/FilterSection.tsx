// One section of a Filters panel: a `label` heading over its control (docs/design/recipes-filter.md 10; pantry-filter.md 5).
import type { ReactNode } from 'react'
import './FilterBar.css'

export interface FilterSectionProps {
  /** The visible heading; a section without one (a lone switch) has none. */
  heading?: string
  /** A capped, scrolling list (an OptionList) inside: its listbox scrolls in its own box. */
  list?: boolean
  children: ReactNode
}

export function FilterSection({ heading, list = false, children }: FilterSectionProps): ReactNode {
  return (
    <section className="filter-panel__section">
      {heading ? <h3 className="filter-panel__heading">{heading}</h3> : null}
      {list ? <div className="filter-panel__list">{children}</div> : children}
    </section>
  )
}
