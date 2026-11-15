// The rows of To confirm (Today's tile, ToConfirmTile in TodayTiles): one row per Meal Slot with its one decision. Split out of the tile
// file (B9-55): a list of rows with actions, not bullet sentences. Renders and wires events only.
import type { FocusEventHandler, ReactNode } from 'react'
import { ActionGroup } from '../../../ui'
import type { ToConfirmRow } from '../lib/toConfirm'
import { toConfirmRowKey, toConfirmRowView, type ToConfirmRowView } from '../lib/toConfirmView'
import { planStrings as s } from '../strings'
import type { PlanEntry, SlotDayKey, SlotKey } from '../types'

export interface RowHandlers {
  onYesCooked: (key: SlotKey) => void
  onAdjust: (key: SlotKey) => void
  onNotCooked: (key: SlotKey) => void
  onAllCooked: (slot: SlotDayKey) => void
  onMarkAllCooked: (slot: SlotDayKey) => void
  onNotCookedSlot: (slot: SlotDayKey) => void
}

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

/** The list of To confirm rows; focus moves to the next row when one goes while it held focus (the caller's onFocus). */
export function ToConfirmList({ rows, slots, today, handlers, onFocus }: { rows: ToConfirmRow[]; slots: PlanEntry[]; today?: string; handlers: RowHandlers; onFocus: FocusEventHandler<HTMLUListElement> }): ReactNode {
  return (
    <ul className="to-confirm__list" onFocus={onFocus}>
      {rows.map((row) => (
        <ToConfirmRowItem key={toConfirmRowKey(row)} row={row} view={toConfirmRowView(row, slots, today)} handlers={handlers} />
      ))}
    </ul>
  )
}
