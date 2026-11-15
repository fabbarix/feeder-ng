import { useEffect, useId, useRef, type ReactElement } from 'react'
import { Button, Tile, TileHeader, TileHeaderLink } from '../../../ui'
import { useShowMore } from '../../../ui/lib/useShowMore'
import type { UnitSystem } from '../../../lib/units'
import { SpoiledLotList } from './SpoiledLotList'
import type { StockLot } from '../types'
import { stockStrings as strings } from '../strings'
import '../stock.css'

export interface SpoiledTileProps {
  lots: StockLot[]
  today: string
  onThrowOut: (lotId: number) => void
  onKeep: (lotId: number) => void
  system?: UnitSystem
}

/**
 * 'Throw out or keep?' for spoiled Stock Lots: `Tile variant='status' status='spoil' as='section'` (B9-29, DS-06: food going off
 * is the spoil tone; danger is loss), with
 * B9-44 (TB-09): the TileHeader (the `spoiled` badge, the title, a count of the Lots, the link "Pantry ›" to the spoiled Stock). One row per lot, with two
 * icon + label `Button size='sm'`s: Throw out = danger-secondary with `throwOut` (Trash), Keep = secondary with `tick`
 * (Check). L-07: each lot is a `ListRow` (title = name, meta = 'go-off wording · amount': SSP-05, the status leads) with the two buttons in its extra
 * slot. B9-09 (DS-09): one DOM at every width; a container query on the list (stock.css, `spoiled-tile`) sets them beside the
 * text from 44 rem of the tile's own width, and under it below that (a phone, or Stock's 24 rem aside). Accessible names stay 'Throw out <name>' / 'Keep <name>'. Renders nothing when lots is empty.
 * Capped at 3 rows with a 'Show N more' toggle (DS-TODAY). Exported for the Today screen.
 * B9-29: when the row a button acted on leaves, focus goes to the next row's Keep (the previous row's after the last one).
 */
/** The header badge: the `spoiled` icon in the spoil tone (spread: the WP8 hygiene check reads a tone attribute as the legacy Tile prop). */
const HEADER_BADGE = { icon: 'spoiled', tone: 'spoil' } as const

export function SpoiledTile({
  lots,
  today,
  onThrowOut,
  onKeep,
  system = 'metric',
}: SpoiledTileProps): ReactElement | null {
  const more = useShowMore(lots)
  const titleId = useId()
  const keepButtons = useRef(new Map<number, HTMLButtonElement>())
  const acted = useRef<{ id: number; index: number } | null>(null)
  const act = (lot: StockLot) => {
    acted.current = {
      id: lot.id,
      index: lots.findIndex((l) => l.id === lot.id),
    }
  }
  useEffect(() => {
    const last = acted.current
    if (!last || lots.some((l) => l.id === last.id)) return
    acted.current = null
    const next = lots[Math.min(last.index, lots.length - 1)]
    if (next) keepButtons.current.get(next.id)?.focus()
  }, [lots])
  if (lots.length === 0) return null
  return (
    <Tile
      as='section'
      variant='status'
      status='spoil'
      span='full'
      aria-labelledby={titleId}
    >
      {/* B9-44 (TB-09): the shared tile header, with the link to the spoiled Stock in the Pantry. */}
      <TileHeader
        {...HEADER_BADGE}
        title={strings.spoiledHeading}
        titleId={titleId}
        count={lots.length}
        countLabel={strings.spoiledCount(lots.length)}
        action={<TileHeaderLink to='/pantry?status=spoiled' label={strings.pantryLink} context={strings.spoiledHeading} />}
      />
      <SpoiledLotList
        lots={more.visible}
        today={today}
        system={system}
        keepButtons={keepButtons.current}
        onThrowOut={(lot) => {
          act(lot)
          onThrowOut(lot.id)
        }}
        onKeep={(lot) => {
          act(lot)
          onKeep(lot.id)
        }}
      />
      {more.capped ? (
        <Button
          variant='secondary'
          size='sm'
          aria-expanded={more.expanded}
          onClick={more.toggle}
        >
          {more.expanded ? strings.showLess : strings.showMore(more.hidden)}
        </Button>
      ) : null}
    </Tile>
  )
}
