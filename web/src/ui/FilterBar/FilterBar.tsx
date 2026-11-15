// B9-15 (DS-03, decision DS 6): the view row of both filter headers (Pantry, Recipes): the view control at the start, the Sort chip at
// the end, on one line. When the Sort's value does not fit beside the view control the Sort is icon-only, its value in its name
// (useSortFits decides; this component only wires it). A hidden, inert copy of the Sort with its value shown is what is measured.
import { useRef, type ReactNode } from 'react'
import { useSortFits } from './useSortFits'

export interface FilterBarViewRowProps {
  /** The view control (the Pantry's Storage Place | Ingredient, the Recipes' view). */
  view: ReactNode
  /** Renders the Sort chip; `iconOnly` is true when its value does not fit. */
  sort?: (p: { iconOnly: boolean }) => ReactNode
}

export function FilterBarViewRow({ view, sort }: FilterBarViewRowProps) {
  const row = useRef<HTMLDivElement>(null)
  const { fits } = useSortFits(row)
  return (
    <div ref={row} className="filter-bar__row filter-bar__view-row">
      {view}
      {sort ? (
        <>
          <div className="filter-bar__sort">{sort({ iconOnly: !fits })}</div>
          {/* Same classes as the shown Sort, so the header's container rules (no leading icon under 24 rem) apply to the copy too. */}
          <div className="filter-bar__sort filter-bar__sort-measure" aria-hidden="true" inert>
            {sort({ iconOnly: false })}
          </div>
        </>
      ) : null}
    </div>
  )
}
