import { useId, type ReactNode } from 'react'
import { Tile, TileHeader } from '../../../ui'
import { toConfirmRows } from '../lib/toConfirm'
import { toConfirmRowKey } from '../lib/toConfirmView'
import { useRowFocusAfterRemoval } from '../hooks/useRowFocusAfterRemoval'
import { planStrings as s } from '../strings'
import type { PlanEntry, SlotDayKey, SlotKey } from '../types'
import { ToConfirmList } from './ToConfirmList'
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
      <ToConfirmList rows={rows} slots={slots} today={today} handlers={handlers} onFocus={focus.onFocus} />
    </Tile>
  )
}

// B9-44 (TB-11): the Leftovers tile lives in its own file; re-exported here for the callers that import it from TodayTiles.
export { LeftoversTile } from './LeftoversTile'
export type { LeftoversTileProps } from './LeftoversTile'
