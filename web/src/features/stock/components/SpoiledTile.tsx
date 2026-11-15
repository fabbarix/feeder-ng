import { useEffect, useRef, type ReactElement } from 'react'
import { Button, ListRow, Tile } from '../../../ui'
import { useShowMore } from '../../../ui/lib/useShowMore'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { describeGoOff } from '../lib/view'
import { capitalise } from '../lib/display'
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
 * the overline 'Throw out or keep?' and the `spoiled` icon. One row per lot, with two
 * icon + label `Button size='sm'`s: Throw out = danger-secondary with `throwOut` (Trash), Keep = secondary with `tick`
 * (Check). L-07: each lot is a `ListRow` (title = name, meta = 'go-off wording · amount': SSP-05, the status leads) with the two buttons in its extra
 * slot. B9-09 (DS-09): one DOM at every width; a container query on the list (stock.css, `spoiled-tile`) sets them beside the
 * text from 44 rem of the tile's own width, and under it below that (a phone, or Stock's 24 rem aside). Accessible names stay 'Throw out <name>' / 'Keep <name>'. Renders nothing when lots is empty.
 * Capped at 3 rows with a 'Show N more' toggle (DS-TODAY). Exported for the Today screen.
 * B9-29: when the row a button acted on leaves, focus goes to the next row's Keep (the previous row's after the last one).
 */
export function SpoiledTile({
  lots,
  today,
  onThrowOut,
  onKeep,
  system = 'metric',
}: SpoiledTileProps): ReactElement | null {
  const more = useShowMore(lots)
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
      aria-label={strings.spoiledHeading}
      overline={strings.spoiledHeading}
      overlineIcon='spoiled'
    >
      <ul className='spoiled-tile__list'>
        {more.visible.map((lot) => {
          const actions = (
            <>
              <Button
                variant='danger-secondary'
                icon='throwOut'
                size='sm'
                aria-label={strings.throwOutLabel(lot.ingredientName)}
                onClick={() => {
                  act(lot)
                  onThrowOut(lot.id)
                }}
              >
                {strings.throwOut}
              </Button>
              <Button
                variant='secondary'
                icon='tick'
                size='sm'
                aria-label={strings.keepLabel(lot.ingredientName)}
                ref={(el: HTMLButtonElement | null) => {
                  if (el) keepButtons.current.set(lot.id, el)
                  else keepButtons.current.delete(lot.id)
                }}
                onClick={() => {
                  act(lot)
                  onKeep(lot.id)
                }}
              >
                {strings.keep}
              </Button>
            </>
          )
          const title = capitalise(lot.ingredientName)
          const meta = `${describeGoOff(lot, today).label} · ${formatQuantity(lot.quantity, lot.baseUnit, system)}`
          return (
            <ListRow key={lot.id} title={title} meta={meta}>
              {actions}
            </ListRow>
          )
        })}
      </ul>
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
