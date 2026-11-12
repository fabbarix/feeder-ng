import type { ReactNode } from 'react'
import { Button, ListGroup, ListRow, Tile } from '../../../ui'
import { groupToConfirm } from '../lib/toConfirm'
import { leftoverRows } from '../lib/leftovers'
import { weekdayName } from '../lib/phrase'
import { planStrings as s } from '../strings'
import type { Leftover, PlanEntry, SlotDayKey, SlotKey } from '../types'
import '../plan.css'

export interface ToConfirmTileProps {
  slots: PlanEntry[]
  /** "Yes, Cooked": one tap, planned Leftover portions. */
  onYesCooked: (key: SlotKey) => void
  /** "Adjust": the Mark as Cooked sheet. */
  onAdjust: (key: SlotKey) => void
  onNotCooked: (key: SlotKey) => void
  /** "Mark all Cooked" of a slot with several Courses to confirm (lib/toConfirm groupToConfirm). */
  onMarkAllCooked?: (slot: SlotDayKey) => void
}

/** The key of one to-confirm entry: its slot, and its Course when the entry carries one. */
const entryKey = (e: PlanEntry): SlotKey => ({ date: e.date, mealSlotId: e.mealSlotId, courseId: e.courseId })

/**
 * Today: Planned Meals still unconfirmed two hours after their slot time. Tile variant surface, span full, h2 "To
 * confirm". A slot with one Course: the Recipe name and slot line with "Yes, Cooked", "Adjust" and "Not cooked". A slot
 * with several Courses: one heading, then a group per Course with its own buttons, and "Mark all Cooked" for the slot.
 * Renders nothing when there are none.
 */
export function ToConfirmTile({ slots, onYesCooked, onAdjust, onNotCooked, onMarkAllCooked = () => {} }: ToConfirmTileProps): ReactNode {
  if (slots.length === 0) return null
  const buttons = (key: SlotKey) => (
    <>
      <Button variant="secondary" size="sm" onClick={() => onYesCooked(key)}>
        {s.yesCooked}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => onAdjust(key)}>
        {s.adjust}
      </Button>
      <Button variant="tertiary" size="sm" onClick={() => onNotCooked(key)}>
        {s.notCooked}
      </Button>
    </>
  )
  return (
    <Tile as="section" span="full">
      <h2 className="plan__tile-title">{s.toConfirmTitle}</h2>
      <ul className="plan__list">
        {groupToConfirm(slots).map((group) => {
          const [first] = group.entries
          if (group.entries.length === 1 && first) {
            return (
              <li key={`${group.slot.date}/${group.slot.mealSlotId}`} className="plan-confirm">
                <div className="plan__stack">
                  <p className="plan-sheet__recipe">{first.meal?.recipeName ?? ''}</p>
                  <p className="plan__muted">{`${weekdayName(first.date, 'short')} ${first.name}`}</p>
                </div>
                <div className="plan__row">{buttons(entryKey(first))}</div>
              </li>
            )
          }
          return (
            <li key={`${group.slot.date}/${group.slot.mealSlotId}`} className="plan-confirm">
              <div className="plan__stack">
                <p className="plan-sheet__recipe">{group.heading}</p>
              </div>
              {group.entries.map((e) => (
                <div key={e.courseId} role="group" aria-label={e.courseName} className="plan__row">
                  <p className="plan__muted">{e.meal?.recipeName ?? ''}</p>
                  {buttons(entryKey(e))}
                </div>
              ))}
              <div className="plan__row">
                <Button variant="secondary" size="sm" onClick={() => onMarkAllCooked(group.slot)}>
                  {s.markAllCooked}
                </Button>
              </div>
            </li>
          )
        })}
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
      className="plan-leftovers"
      overline={s.leftoversOverline}
      overlineIcon="leftover"
      stretched={onOpen ? { label: s.leftoversTitle, onActivate: onOpen } : undefined}
    >
      <h2 className="plan__tile-title">{s.leftoversTitle}</h2>
      <ListGroup label={s.leftoversTitle}>
        {rows.map((row) => (
          <ListRow key={row.id} title={row.recipeName} meta={s.leftoverRowMeta(row.portions, row.useBy)} />
        ))}
      </ListGroup>
    </Tile>
  )
}
