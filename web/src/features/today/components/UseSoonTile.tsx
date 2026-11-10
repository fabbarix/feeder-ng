import type { ReactElement } from 'react'
import { Tile } from '../../../ui'
import { todayStrings as s } from '../strings'
import type { UseSoonItem } from '../types'
import '../today.css'

export interface UseSoonTileProps {
  items: UseSoonItem[]
}

/** "Use soon": Ingredient names with their go-off wording, in the fixed spoil colour. Renders nothing when empty. */
export function UseSoonTile({ items }: UseSoonTileProps): ReactElement | null {
  if (items.length === 0) return null
  return (
    <Tile as="section" tone="spoil" aria-label={s.useSoonHeading}>
      <h2 className="today__tile-title">{s.useSoonHeading}</h2>
      <ul className="today__list">
        {items.map((item) => (
          <li key={item.ingredientId} className="today__row">
            <span className="today__recipe">{item.name}</span>
            <span className="today__muted">{item.when}</span>
          </li>
        ))}
      </ul>
    </Tile>
  )
}
