// SET-15: the "Removed Meal Slots" tile under the cards: a removed Meal Slot that kept Cooked meals, with "Put back" for an Admin.
// Renders and wires events; the rows' words are in lib/removedMealSlots.
import { useId } from 'react'
import { Button, ListGroup, ListRow, Tile, TileHeader } from '../../../ui'
import { documentLocale } from '../lib/locale'
import { removedMealSlotRows, type RemovedMealSlotGroup, type RemovedRow } from '../lib/removedMealSlots'
import { settingsStrings } from '../strings'
import '../mealSlotCards.css'

const text = settingsStrings.removed

export interface RemovedMealSlotsProps {
  /** The answer of `GET /api/meal-slots?removed=with-history`. The tile is not drawn for an empty list. */
  groups: readonly RemovedMealSlotGroup[]
  /** An Admin gets "Put back"; a plain User sees the tile without it. */
  canRestore: boolean
  /** The key of the row being put back (its button is busy and every Put back is disabled meanwhile). */
  busyKey?: string | null
  locale?: string
  onPutBack: (row: RemovedRow) => void
}

export function RemovedMealSlots({ groups, canRestore, busyKey = null, locale = documentLocale(), onPutBack }: RemovedMealSlotsProps) {
  const titleId = useId()
  if (groups.length === 0) return null
  const rows = removedMealSlotRows(groups, locale)
  return (
    <Tile as="section" span="full" aria-labelledby={titleId} className="rm-tile">
      <TileHeader icon="history" title={text.title} titleId={titleId} count={rows.length} countLabel={text.countLabel(rows.length)} />
      <p className="rm-note">{text.note}</p>
      <ListGroup label={text.title}>
        {rows.map((row) => (
          <ListRow
            key={row.key}
            title={row.title}
            meta={row.detail}
            value={row.value}
            actions={
              canRestore ? (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={row.putBackLabel}
                  loading={busyKey === row.key}
                  disabled={busyKey !== null && busyKey !== row.key}
                  onClick={() => onPutBack(row)}
                >
                  {text.putBackButton}
                </Button>
              ) : undefined
            }
          />
        ))}
      </ListGroup>
    </Tile>
  )
}
