// B9-45 (PC-05): the Get ready rows, shared by the tile, the Ingredients sheet and the rail. A row is a ListRow: our own Checkbox, the
// Ingredient as the title, the Storage Place of its soonest Lot in the meta, the scaled amount in the value column. A ticked row is
// muted and its name struck through (local to the device; no Stock changes). A timeline of several Courses has a subheader per Course.
import type { ReactNode } from 'react'
import { Checkbox, ListRow } from '../../../ui'
import { readyLabel, type ReadySection } from '../lib/ingredients'

export interface ReadyListProps {
  sections: ReadySection[]
  ticked: ReadonlySet<string>
  onToggle: (key: string) => void
}

export function ReadyList({ sections, ticked, onToggle }: ReadyListProps): ReactNode {
  // P38-style unique names: an Ingredient in two Courses' lists names its Course too ("Onion, 1 piece, Side · Green beans")
  const seen = new Map<string, number>()
  for (const section of sections) for (const row of section.rows) seen.set(readyLabel(row), (seen.get(readyLabel(row)) ?? 0) + 1)
  const labelOf = (row: ReadySection['rows'][number], title: string | null | undefined) =>
    (seen.get(readyLabel(row)) ?? 0) > 1 && title ? `${readyLabel(row)}, ${title}` : readyLabel(row)
  return (
    <div className="get-ready__sections">
      {sections.map((section) => (
        <div key={section.key} className="get-ready__section">
          {section.title ? <h3 className="get-ready__course">{section.title}</h3> : null}
          <ul role="list" className="get-ready__list">
            {section.rows.map((row) => {
              const on = ticked.has(row.key)
              return (
                <ListRow
                  key={row.key}
                  data-ticked={on ? 'true' : 'false'}
                  title={row.name}
                  meta={row.place ?? undefined}
                  value={row.amount}
                  control={
                    <span className="get-ready__check">
                      <Checkbox label={labelOf(row, section.title)} checked={on} onChange={() => onToggle(row.key)} />
                    </span>
                  }
                />
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
