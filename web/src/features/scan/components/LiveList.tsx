import type { UnitSystem } from '../../../lib/units'
import { listEntries } from '../../shop/lib/lines'
import type { ShoppingList } from '../../shop/types'
import { scanStrings } from '../strings'

export interface LiveListProps {
  list: ShoppingList
  system: UnitSystem
}

/** The compact Shopping List under the viewfinder: what is left, the ticked ones struck through. Read-only. */
export function LiveList({ list, system }: LiveListProps) {
  const { open, ticked } = listEntries(list, system)
  const left = list.progress.total - list.progress.ticked
  return (
    <section className="live-list">
      <p className="live-list__count">{scanStrings.left(left)}</p>
      <ul aria-label="Shopping List" className="live-list__entries">
        {[...open, ...ticked].map((entry) => (
          <li key={entry.key} className="live-list__entry" data-state={entry.ticked ? 'ticked' : 'open'}>
            <span className="live-list__title">{entry.title}</span>
            {entry.detail ? <span className="live-list__detail">{entry.detail}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
