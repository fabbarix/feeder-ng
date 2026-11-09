import type { UnitSystem } from '../../../lib/units'
import { listItems } from '../../shop/lib/lines'
import type { ShoppingList } from '../../shop/types'
import { scanStrings } from '../strings'

export interface LiveListProps {
  list: ShoppingList
  system: UnitSystem
}

/** The compact Shopping List under the viewfinder: what is left, the ticked ones struck through. Read-only. */
export function LiveList({ list, system }: LiveListProps) {
  const { open, done } = listItems(list, system)
  const left = list.progress.total - list.progress.done
  return (
    <section className="live-list">
      <p className="live-list__count">{scanStrings.left(left)}</p>
      <ul aria-label="Shopping List" className="live-list__items">
        {[...open, ...done].map((item) => (
          <li key={item.key} className="live-list__item" data-state={item.ticked ? 'done' : 'open'}>
            <span className="live-list__title">{item.title}</span>
            {item.detail ? <span className="live-list__detail">{item.detail}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
