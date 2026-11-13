import type { ReactNode } from 'react'
import { ActionGroup, Icon, ListGroup, ListRow, Tile } from '../../../ui'
import { LeftoverItems } from '../../../ui/LeftoverActions/LeftoverItems'
import type { LeftoverActionKind, LeftoverAnswer } from '../../../lib/leftovers/types'
import type { Leftover as LeftoverFull } from '../../../lib/leftovers/types'
import type { LeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import { toConfirmMeta, toConfirmRows, type ToConfirmRow } from '../lib/toConfirm'
import { asLeftover, leftoverRows } from '../lib/leftovers'
import { tileRows } from '../../../lib/leftovers/rows'
import { planStrings as s } from '../strings'
import type { Leftover, PlanEntry, SlotDayKey, SlotKey } from '../types'
import '../plan.css'
import './TonightHero.css'

export interface ToConfirmTileProps {
  slots: PlanEntry[]
  /** One Course: "Cooked", one tap with the planned Leftover portions. */
  onYesCooked: (key: SlotKey) => void
  /** One Course: "Adjust", the Mark as Cooked sheet. */
  onAdjust: (key: SlotKey) => void
  /** One Course: "Not cooked" in the ⋮. */
  onNotCooked: (key: SlotKey) => void
  /** Several Courses: "All Cooked", one tap for the slot's Courses (planned Leftovers). */
  onAllCooked?: (slot: SlotDayKey) => void
  /** Several Courses: "Adjust", the Mark all Cooked sheet where each Course is set on its own. */
  onMarkAllCooked?: (slot: SlotDayKey) => void
  /** Several Courses: "Not cooked" in the ⋮, the whole Meal Slot. */
  onNotCookedSlot?: (slot: SlotDayKey) => void
}

const noop = (): void => {}

/** One row of To confirm: day and slot, the Main Recipe with its "+ Side" line, and the one decision (ActionGroup). */
function ToConfirmRowItem({ row, handlers }: { row: ToConfirmRow; handlers: Required<Omit<ToConfirmTileProps, 'slots'>> }): ReactNode {
  const label = `${row.dayLabel} ${row.slotName}`
  const meta = toConfirmMeta(row)
  const single = row.single
  const group =
    single !== undefined
      ? {
          primary: { label: s.cooked, onClick: () => handlers.onYesCooked(single) },
          secondary: { label: s.adjust, onClick: () => handlers.onAdjust(single) },
          more: [{ id: 'not-cooked', label: s.notCooked, onSelect: () => handlers.onNotCooked(single) }],
        }
      : {
          primary: { label: s.allCookedShort, onClick: () => handlers.onAllCooked(row.slot) },
          secondary: { label: s.adjust, onClick: () => handlers.onMarkAllCooked(row.slot) },
          more: [{ id: 'not-cooked', label: s.notCooked, onSelect: () => handlers.onNotCookedSlot(row.slot) }],
        }
  return (
    // The row is the ActionGroup's container (action-group-host): the group is its direct child (DS-A round 2).
    <li className="to-confirm__row action-group-host">
      <p className="to-confirm__when">
        <span>{row.dayLabel}</span>
        <span>{row.slotName}</span>
      </p>
      <div className="to-confirm__text">
        <p className="to-confirm__title">{row.main}</p>
        {meta ? (
          <p className="to-confirm__meta">
            {meta.emphasis !== null ? <strong>{meta.emphasis}</strong> : null}
            {meta.emphasis !== null ? ' · ' : null}
            {meta.text}
          </p>
        ) : null}
      </div>
      <ActionGroup label={label} primary={group.primary} secondary={group.secondary} more={group.more} />
    </li>
  )
}

/**
 * Today: Planned Meals still unconfirmed two hours after their slot time (docs/design/system.md §9). One row per Meal
 * Slot: "Cooked" (or "All Cooked" for several Courses) is the primary, "Adjust" the secondary, "Not cooked" the ⋮.
 * Renders nothing when there are none.
 */
export function ToConfirmTile({ slots, onYesCooked, onAdjust, onNotCooked, onAllCooked = noop, onMarkAllCooked = noop, onNotCookedSlot = noop }: ToConfirmTileProps): ReactNode {
  const rows = toConfirmRows(slots)
  if (rows.length === 0) return null
  const handlers = { onYesCooked, onAdjust, onNotCooked, onAllCooked, onMarkAllCooked, onNotCookedSlot }
  return (
    <Tile as="section" span="full">
      <div className="to-confirm__head">
        <span className="to-confirm__badge" data-tone="info">
          <Icon name="markCooked" size={20} />
        </span>
        <h2 className="to-confirm__heading">{s.toConfirmTitle}</h2>
        <span className="to-confirm__count" data-shape="pill">
          {rows.length}
        </span>
      </div>
      <ul className="to-confirm__list">
        {rows.map((row) => (
          <ToConfirmRowItem key={`${row.slot.date}/${row.slot.mealSlotId}`} row={row} handlers={handlers} />
        ))}
      </ul>
    </Tile>
  )
}

export interface LeftoversTileProps {
  leftovers: Leftover[]
  today: string
  /** The tile's tone: "info" while a question is open (round 2), else the Leftover tone. */
  tone?: 'info' | 'leftover'
  /** Makes the whole tile open the Plan (stretched target named "Leftovers to use"); the rows sit above it. */
  onOpen?: () => void
  /** B5-LOW: the rows act in place: a question answers (after the dry run), a row opens its sheet from the flow. */
  flow?: LeftoverFlow
}

/**
 * Today: the Leftovers to use, soonest Use-by first. Half tile, variant status leftover, overline "LEFTOVERS" with the
 * leftover icon, a row per Leftover "Chicken curry" with meta "2 portions · Use by Thu" (the spoil tone when due
 * today or tomorrow). Renders nothing when there are none.
 */
export function LeftoversTile({ leftovers, today, onOpen, flow, tone = 'leftover' }: LeftoversTileProps): ReactNode {
  // With a flow the frozen Leftovers that are not to answer stay on the Pantry: the tile lists what it shows.
  const rows = flow ? [] : leftoverRows(leftovers, today)
  if (flow ? tileRows(leftovers.map(asLeftover), today).length === 0 : rows.length === 0) return null
  return (
    <Tile
      as="section"
      variant="status"
      status={tone}
      className="plan-leftovers"
      overline={s.leftoversOverline}
      overlineIcon="leftover"
      stretched={onOpen ? { label: s.leftoversTitle, onActivate: onOpen } : undefined}
    >
      <h2 className="plan__tile-title">{s.leftoversTitle}</h2>
      {flow ? (
        <LeftoverItems
          leftovers={leftovers.map(asLeftover)}
          today={today}
          busy={flow.busy}
          onAction={(kind: LeftoverActionKind, l: LeftoverFull) => flow.openSheet(kind, l)}
          onAnswer={(l: LeftoverFull, answer: LeftoverAnswer) => void flow.answer(l, answer)}
        />
      ) : (
        <ListGroup label={s.leftoversTitle}>
          {rows.map((row) => (
            <ListRow key={row.id} title={row.recipeName} meta={s.leftoverRowMeta(row.portions, row.useBy)} />
          ))}
        </ListGroup>
      )}
    </Tile>
  )
}
