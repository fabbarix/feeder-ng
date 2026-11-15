import { useId, type ReactNode } from 'react'
import { ActionGroup, Tile, TileHeader } from '../../../ui'
import { toConfirmRows, type ToConfirmRow } from '../lib/toConfirm'
import { toConfirmRowKey, toConfirmRowView, type ToConfirmRowView } from '../lib/toConfirmView'
import { useRowFocusAfterRemoval } from '../hooks/useRowFocusAfterRemoval'
import { planStrings as s } from '../strings'
import type { PlanEntry, SlotDayKey, SlotKey } from '../types'
import '../plan.css'
import './TonightHero.css'

/** The TileHeader badge tone, spread (the native-controls check reads a tone attribute on a Tile-named element as the legacy prop). */
const INFO_BADGE = { tone: 'info' } as const

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
  /** B9-39 (TB-01): the household date; a row of today (it has just joined at its slot time) reads "Today" in the info tone, with its time. */
  today?: string
}

const noop = (): void => {}

type RowHandlers = Required<Omit<ToConfirmTileProps, 'slots' | 'today'>>

/** One row of To confirm: day and slot, the Main Recipe with its "+ Side" line, and the one decision (ActionGroup). */
function ToConfirmRowItem({ row, view, handlers }: { row: ToConfirmRow; view: ToConfirmRowView; handlers: RowHandlers }): ReactNode {
  const single = row.single
  const group =
    single !== undefined
      ? {
          primary: { label: view.primaryLabel, 'aria-label': view.primaryName, onClick: () => handlers.onYesCooked(single) },
          secondary: { label: s.adjust, 'aria-label': view.secondaryName, onClick: () => handlers.onAdjust(single) },
          more: [{ id: 'not-cooked', label: s.notCooked, onSelect: () => handlers.onNotCooked(single) }],
        }
      : {
          primary: { label: view.primaryLabel, 'aria-label': view.primaryName, onClick: () => handlers.onAllCooked(row.slot) },
          secondary: { label: s.adjust, 'aria-label': view.secondaryName, onClick: () => handlers.onMarkAllCooked(row.slot) },
          more: [{ id: 'not-cooked', label: s.notCooked, onSelect: () => handlers.onNotCookedSlot(row.slot) }],
        }
  const meta = view.meta
  return (
    // The row is the ActionGroup's container (action-group-host): the group is its direct child (DS-A round 2).
    <li className="to-confirm__row action-group-host" data-fresh={view.fresh ? 'true' : undefined} data-row-focus-key={toConfirmRowKey(row)}>
      <p className="to-confirm__when">
        <span>{view.dayLabel}</span>
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
      <ActionGroup label={view.groupLabel} primary={group.primary} secondary={group.secondary} more={group.more} />
    </li>
  )
}

/**
 * Today: Planned Meals still unconfirmed (docs/design/system.md §9): the slots of today whose time has come first (TB-01), then the
 * server's (two hours after their slot time). One row per Meal Slot: "Cooked" (or "All Cooked" for several Courses) is the primary,
 * "Adjust" the secondary, "Not cooked" the ⋮; each named by its Recipe, day and Meal Slot (A11Y-08). When a row goes while it held
 * focus, focus moves to the next row. Renders nothing when there are none.
 */
export function ToConfirmTile({ slots, onYesCooked, onAdjust, onNotCooked, onAllCooked = noop, onMarkAllCooked = noop, onNotCookedSlot = noop, today }: ToConfirmTileProps): ReactNode {
  const rows = toConfirmRows(slots)
  const focus = useRowFocusAfterRemoval(rows.map(toConfirmRowKey))
  const titleId = useId()
  if (rows.length === 0) return null
  const handlers = { onYesCooked, onAdjust, onNotCooked, onAllCooked, onMarkAllCooked, onNotCookedSlot }
  return (
    <Tile as="section" span="full" aria-labelledby={titleId}>
      {/* B9-44 (TB-09): the shared tile header (an info badge, the title that names the section, a count). */}
      <TileHeader icon="markCooked" {...INFO_BADGE} title={s.toConfirmTitle} titleId={titleId} count={rows.length} countLabel={s.toConfirmCount(rows.length)} />
      <ul className="to-confirm__list" onFocus={focus.onFocus}>
        {rows.map((row) => (
          <ToConfirmRowItem key={toConfirmRowKey(row)} row={row} view={toConfirmRowView(row, slots, today)} handlers={handlers} />
        ))}
      </ul>
    </Tile>
  )
}

// B9-44 (TB-11): the Leftovers tile lives in its own file; re-exported here for the callers that import it from TodayTiles.
export { LeftoversTile } from './LeftoversTile'
export type { LeftoversTileProps } from './LeftoversTile'
