import type { ReactNode } from 'react'
import { Button, ListGroup, ListRow, Tile } from '../../../ui'
import { couldntPlanText } from '../lib/couldnt'
import { leftoverRows } from '../lib/leftovers'
import { weekdayName } from '../lib/phrase'
import { planStrings as s } from '../strings'
import type { Leftover, PlanSlot, SlotKey } from '../types'
import '../plan.css'

export interface ToConfirmTileProps {
  slots: PlanSlot[]
  /** "Yes, Cooked": one tap, planned Leftover portions. */
  onYesCooked: (key: SlotKey) => void
  /** "Adjust": the Mark as Cooked sheet. */
  onAdjust: (key: SlotKey) => void
  onNotCooked: (key: SlotKey) => void
}

/**
 * Today: Planned Meals still unconfirmed two hours after their slot time. Tile variant surface, span full, h2 "To
 * confirm", per meal the Recipe name and slot line with secondary "Yes, Cooked" and "Adjust" and tertiary "Not cooked".
 * Renders nothing when there are none.
 */
export function ToConfirmTile({ slots, onYesCooked, onAdjust, onNotCooked }: ToConfirmTileProps): ReactNode {
  if (slots.length === 0) return null
  return (
    <Tile as="section" span="full">
      <h2 className="plan__tile-title">{s.toConfirmTitle}</h2>
      <ul className="plan__list">
        {slots.map((slot) => {
          const key: SlotKey = { date: slot.date, mealSlotId: slot.mealSlotId }
          return (
            <li key={`${slot.date}/${slot.mealSlotId}`} className="plan-confirm">
              <div className="plan__stack">
                <p className="plan-sheet__recipe">{slot.meal?.recipeName ?? ''}</p>
                <p className="plan__muted">{`${weekdayName(slot.date, 'short')} ${slot.name}`}</p>
              </div>
              <div className="plan__row">
                <Button variant="secondary" size="sm" onClick={() => onYesCooked(key)}>
                  {s.yesCooked}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onAdjust(key)}>
                  {s.adjust}
                </Button>
                <Button variant="tertiary" size="sm" onClick={() => onNotCooked(key)}>
                  {s.notCooked}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Tile>
  )
}

export interface CouldntPlanNoticeProps {
  slots: PlanSlot[]
}

/** Today: "Couldn't plan Thursday dinner: ..." for each slot the planner left empty. Renders nothing when there are none. */
export function CouldntPlanNotice({ slots }: CouldntPlanNoticeProps): ReactNode {
  if (slots.length === 0) return null
  return (
    <Tile variant="status" status="danger" span="full" role="status">
      <ul className="plan__list">
        {slots.map((s) => (
          <li key={`${s.date}/${s.mealSlotId}`}>{couldntPlanText(s)}</li>
        ))}
      </ul>
    </Tile>
  )
}

export interface LeftoversTileProps {
  leftovers: Leftover[]
  today: string
  /** Makes the whole tile open the Plan (stretched target named "Leftovers to use"). */
  onOpen?: () => void
}

/**
 * Today: the Leftovers to use, soonest Use-by first. Half tile, variant status leftover, overline "LEFTOVERS" with the
 * leftover icon, a row per Leftover "Chicken curry" with meta "2 portions · Use by Thu" (the spoil tone when due
 * today or tomorrow). Renders nothing when there are none.
 */
export function LeftoversTile({ leftovers, today, onOpen }: LeftoversTileProps): ReactNode {
  const rows = leftoverRows(leftovers, today)
  if (rows.length === 0) return null
  return (
    <Tile
      as="section"
      variant="status"
      status="leftover"
      overline={s.leftoversOverline}
      overlineIcon="leftover"
      stretched={onOpen ? { label: s.leftoversTitle, onActivate: onOpen } : undefined}
    >
      <h2 className="plan__tile-title">{s.leftoversTitle}</h2>
      <ListGroup label={s.leftoversTitle}>
        {rows.map((row) => (
          <ListRow key={row.id} title={row.recipeName} meta={s.leftoverRowMeta(row.portions, row.useBy)} icon="leftover" />
        ))}
      </ListGroup>
    </Tile>
  )
}
