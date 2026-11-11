import { Chip, EmptyState, IconButton, mealSlotIcon } from '../../../ui'
import { weekdayLongName, weekdayOrder, type WeekStart } from '../../../ui/WeekdayPicker/weekdays'
import { documentLocale } from '../lib/locale'
import { slotAnchorId } from '../lib/slotAnchor'
import { settingsStrings } from '../strings'
import type { MealSlot, Member } from '../types'
import { AttendeePills } from './AttendeePills'
import '../settings.css'

export interface MealSlotWeekProps {
  slots: MealSlot[]
  members: Member[]
  canEdit: boolean
  /** Disable "Add Meal Slot" (the Members have not loaded, so a new slot would start with nobody). */
  addDisabled?: boolean
  weekStart?: WeekStart
  locale?: string
  /** Admin: add a Meal Slot starting on this ISO weekday (1..7). */
  onAdd: (weekday: number) => void
  /** Tap on a slot chip: an Admin gets the MealSlot sheet (with "Change a date"), a plain User the one-date Attendance. */
  onOpen: (slot: MealSlot) => void
}

const text = settingsStrings.slot

/**
 * Seven `role=group` rows named by their weekday (Monday first). Each holds the day's Meal Slots as chips "Dinner 19:30"
 * (slot icon, earliest first) with who attends as pills, or "No Meal Slot"; an Admin also gets an IconButton "Add Meal Slot on <weekday>".
 * With no Meal Slots at all, an EmptyState comes first. Each Meal Slot has an anchor id for deep links.
 */
export function MealSlotWeek({ slots, members, canEdit, addDisabled = false, weekStart = 1, locale = documentLocale(), onAdd, onOpen }: MealSlotWeekProps) {
  return (
    <div className="settings__stack">
      {slots.length === 0 ? <EmptyState title={text.empty} description={text.emptyHint} /> : null}
      {weekdayOrder(weekStart).map((day) => {
        const name = weekdayLongName(day, locale)
        const daySlots = slots.filter((s) => s.weekday === day).sort((a, b) => a.time.localeCompare(b.time))
        return (
          <div key={day} role="group" aria-label={name} className="meal-week__day">
            <span className="meal-week__name">{name}</span>
            <div className="meal-week__slots">
              {daySlots.length === 0 ? (
                <span className="settings__muted">{text.noSlot}</span>
              ) : (
                daySlots.map((slot) => (
                  <div key={slot.id} id={slotAnchorId(slot.id)} tabIndex={-1} className="meal-week__slot">
                    <Chip kind="tag" icon={mealSlotIcon(slot.name)} onClick={() => onOpen(slot)}>
                      {text.slotButton(slot.name, slot.time)}
                    </Chip>
                    <AttendeePills slot={slot} members={members} onFix={onOpen} locale={locale} />
                  </div>
                ))
              )}
            </div>
            {canEdit ? <IconButton icon="add" label={`${text.add} on ${name}`} size="compact" disabled={addDisabled} onClick={() => onAdd(day)} /> : null}
          </div>
        )
      })}
    </div>
  )
}
