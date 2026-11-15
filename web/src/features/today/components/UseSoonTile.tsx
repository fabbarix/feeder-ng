import { useId, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { ListRow, Thumb, Tile, TileHeader, TileHeaderLink } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { useSoonRow, splitUseSoon, USE_SOON_LINK } from '../lib/useSoon'
import { todayStrings as s } from '../strings'
import type { UseSoonItem } from '../types'
import '../today.css'

export interface UseSoonTileProps {
  items: UseSoonItem[]
  /** The Household's unit system, for the amounts. */
  system: UnitSystem
  /** Pressing a row opens its soonest Lot in the Pantry's Lot sheet, over Today. */
  onOpenLot: (lotId: number) => void
}

/** The header badge's tone, spread (a hygiene check reads a tone attribute on a Tile-named element as the legacy prop). */
const SPOIL_BADGE = { tone: 'spoil' } as const

/**
 * B9-44 (TB-09, TB-11): "Use soon", a spoil status tile (never an accent) with the shared header (an hourglass badge, the title, a count,
 * the link "Pantry ›" to the Pantry's Use soon). One ListRow per Ingredient in a `ul`: its monogram or Picture, the name, "Good until
 * tomorrow" in the spoil tone and the amount going off soonest as the value; pressing a row opens its soonest Lot. At most three rows,
 * then a "+2 more" link to the Pantry. Renders nothing when empty.
 */
export function UseSoonTile({ items, system, onOpenLot }: UseSoonTileProps): ReactElement | null {
  const titleId = useId()
  if (items.length === 0) return null
  const { rows, more } = splitUseSoon(items)
  return (
    <Tile as="section" variant="status" status="spoil" aria-labelledby={titleId} className="use-soon">
      <TileHeader
        icon="useSoon"
        {...SPOIL_BADGE}
        title={s.useSoonHeading}
        titleId={titleId}
        count={items.length}
        countLabel={s.countItems(items.length)}
        action={<TileHeaderLink to={USE_SOON_LINK} label={s.pantryLink} context={s.useSoonLinkContext} />}
      />
      <ul className="today__rows">
        {rows.map((item) => {
          const row = useSoonRow(item, system)
          const common = {
            leading: <Thumb name={item.name} size={40} />,
            meta: row.meta,
            metaStatus: 'spoil' as const,
            value: row.amount ?? undefined,
          }
          return item.soonestLotId !== undefined ? (
            <ListRow key={item.ingredientId} title={item.name} aria-label={row.name} haspopup="dialog" onActivate={() => onOpenLot(item.soonestLotId!)} {...common} />
          ) : (
            <ListRow key={item.ingredientId} title={item.name} {...common} />
          )
        })}
      </ul>
      {more > 0 ? (
        <Link className="today__more-link" to={USE_SOON_LINK}>
          {s.useSoonMore(more)}
        </Link>
      ) : null}
    </Tile>
  )
}
