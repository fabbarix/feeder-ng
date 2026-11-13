import type { ReactNode } from 'react'
import { slotRows } from '../lib/courses'
import type { PlanSlot, SlotDateActions, SlotDayKey, SlotKey } from '../types'
import { NotServedRow } from './NotServedRow'
import { PlanCourseRow } from './PlanCourseRow'
import { SlotHeader } from './SlotHeader'
import '../plan.css'

export interface MealTileProps {
  slot: PlanSlot
  /** Household date: Cook is offered for today's planned meal only (lib/rowActions slotHead). */
  today: string
  /** Opens the Planned Meal sheet of a Course (its Recipe row). */
  onOpen: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  /** Pin and Unpin on a Course row (wired to actions.pin and actions.unpin). */
  onPin?: (key: SlotKey) => void
  onUnpin?: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
  /** Cook Mode for the slot. */
  onCook: (key: SlotDayKey) => void
  /** The slot menu's actions; the menu shows only for a slot that has them (lib/rowActions slotHead). */
  onMarkAllCooked?: (slot: SlotDayKey) => void
  onNotCookedSlot?: (slot: SlotDayKey) => void
  onAddCourse?: (key: SlotKey) => void
  /** The per-date choices (slot menu entries, Plan <Slot> again on a Not served slot). */
  dateActions?: SlotDateActions
}

const noop = () => {}

/**
 * A Meal Slot on a day tile (ds-plan): the slot header (name, time, Cook and ⋮), then a list of Course rows (PlanCourseRow).
 * One structure for one Course and for several. A Not served date is one compact row (NotServedRow).
 */
export function MealTile({ slot, today, onOpen, onSwap, onPin = noop, onUnpin = noop, onChoose, onCook, onMarkAllCooked = noop, onNotCookedSlot = noop, onAddCourse = noop, dateActions }: MealTileProps): ReactNode {
  if (dateActions && slot.notServed) return <NotServedRow slot={slot} offline={dateActions.offline} onPlanAgain={dateActions.onPlanAgain} />
  const rows = slotRows(slot)
  if (rows.length === 0) return null
  return (
    <div className="plan-meal">
      <SlotHeader slot={slot} today={today} onCook={onCook} onMarkAllCooked={onMarkAllCooked} onNotCookedSlot={onNotCookedSlot} onAddCourse={onAddCourse} dateActions={dateActions} />
      <ul aria-label={`${slot.name} Courses`} className="plan-meal__courses">
        {rows.map((row) => (
          <PlanCourseRow key={row.course.courseId} row={row} slot={slot} today={today} onOpen={onOpen} onSwap={onSwap} onPin={onPin} onUnpin={onUnpin} onChoose={onChoose} />
        ))}
      </ul>
    </div>
  )
}
