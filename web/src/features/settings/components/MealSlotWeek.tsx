import { Chip, EmptyState, IconButton, mealSlotIcon } from '../../../ui'
import { WEEKDAYS } from '../lib/weekdays'
import { settingsStrings } from '../strings'
import type { MealSlot, Member } from '../types'
import '../settings.css'

export interface MealSlotWeekProps {
  slots: MealSlot[]
  members: Member[]
  canEdit: boolean
  /** Admin: add a Meal Slot starting on this ISO weekday (1..7). */
  onAdd: (weekday: number) => void
  /** Tap on a slot chip: an Admin gets the MealSlot sheet (with "Change a date"), a plain User the one-date Attendance. */
  onOpen: (slot: MealSlot) => void
}

const text = settingsStrings.slot

/**
 * Seven `role=group` rows, Monday first, named by their weekday. Each holds the day's Meal Slots as chips "Dinner 19:30"
 * (slot icon, earliest first) or "No Meal Slot"; an Admin also gets an IconButton "Add Meal Slot on <weekday>".
 * With no Meal Slots at all, an EmptyState comes first.
 */
export function MealSlotWeek({ slots, canEdit, onAdd, onOpen }: MealSlotWeekProps) {
  return (
    <div className="settings__stack">
      {slots.length === 0 ? <EmptyState title={text.empty} description={text.emptyHint} /> : null}
      {WEEKDAYS.map((day) => {
        const daySlots = slots.filter((s) => s.weekday === day.id).sort((a, b) => a.time.localeCompare(b.time))
        return (
          <div key={day.id} role="group" aria-label={day.name} className="meal-week__day">
            <span className="meal-week__name">{day.name}</span>
            <div className="meal-week__slots">
              {daySlots.length === 0 ? (
                <span className="settings__muted">{text.noSlot}</span>
              ) : (
                daySlots.map((slot) => (
                  <Chip key={slot.id} kind="tag" icon={mealSlotIcon(slot.name)} onClick={() => onOpen(slot)}>
                    {`${slot.name} ${slot.time}`}
                  </Chip>
                ))
              )}
            </div>
            {canEdit ? (
              <IconButton icon="add" label={`${text.add} on ${day.name}`} size="compact" onClick={() => onAdd(day.id)} />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
