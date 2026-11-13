import type { ReactElement } from 'react'
import { Tile } from '../../../ui'
import { splitUseSoon } from '../lib/useSoon'
import { todayStrings as s } from '../strings'
import type { UseSoonItem } from '../types'
import '../today.css'

export interface UseSoonTileProps {
  items: UseSoonItem[]
}

/**
 * "Use soon": a half status tile in the fixed spoil colour (never an accent). One row per Ingredient "Spinach · Thu",
 * at most three, then "+2 more". Renders nothing when empty.
 */
export function UseSoonTile({ items }: UseSoonTileProps): ReactElement | null {
  if (items.length === 0) return null
  const { rows, more } = splitUseSoon(items)
  return (
    <Tile as="section" variant="status" status="spoil" aria-label={s.useSoonHeading}>
      <h2 className="today__tile-title">{s.useSoonHeading}</h2>
      <ul className="today__list">
        {rows.map((item) => (
          <li key={item.ingredientId} className="today__row">{`${item.name} · ${item.when}`}</li>
        ))}
      </ul>
      {more > 0 ? <p className="today__hint">{s.useSoonMore(more)}</p> : null}
    </Tile>
  )
}
