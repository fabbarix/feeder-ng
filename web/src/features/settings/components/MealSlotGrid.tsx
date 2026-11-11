import { Chip, IconButton, mealSlotIcon } from '../../../ui'
import { weekdayLongName, weekdayShortName, type WeekStart } from '../../../ui/WeekdayPicker/weekdays'
import { documentLocale } from '../lib/locale'
import { slotAnchorId } from '../lib/slotAnchor'
import { weekGrid } from '../lib/weekGrid'
import { settingsStrings } from '../strings'
import type { MealSlot, Member } from '../types'
import { AttendeePills } from './AttendeePills'
import '../settings.css'

export interface MealSlotGridProps {
  slots: MealSlot[]
  members: Member[]
  canEdit: boolean
  addDisabled?: boolean
  weekStart?: WeekStart
  locale?: string
  /** Admin: add a Meal Slot on this weekday. */
  onAdd: (weekday: number) => void
  onOpen: (slot: MealSlot) => void
}

const text = settingsStrings.slot

/** The desktop week as a table: days as columns, Meal Slot names as rows. */
export function MealSlotGrid({ slots, members, canEdit, addDisabled = false, weekStart = 1, locale = documentLocale(), onAdd, onOpen }: MealSlotGridProps) {
  const grid = weekGrid(slots, weekStart)
  return (
    <table className="meal-grid" aria-label={text.gridLabel}>
      <thead>
        <tr>
          <td />
          {grid.days.map((day) => (
            <th key={day} scope="col" aria-label={weekdayLongName(day, locale)}>
              {weekdayShortName(day, locale)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.rows.map((row) => (
          <tr key={row.name.toLowerCase()}>
            <th scope="row">{row.name}</th>
            {row.cells.map((slot, i) => {
              const day = grid.days[i]!
              const weekday = weekdayLongName(day, locale)
              return (
                <td key={day} aria-label={text.cellLabel(row.name, weekday)}>
                  {slot ? (
                    <div id={slotAnchorId(slot.id)} tabIndex={-1} className="meal-grid__slot">
                      <Chip kind="tag" icon={mealSlotIcon(slot.name)} onClick={() => onOpen(slot)}>
                        {text.slotButton(slot.name, slot.time)}
                      </Chip>
                      <AttendeePills slot={slot} members={members} onFix={onOpen} locale={locale} />
                    </div>
                  ) : canEdit ? (
                    <IconButton icon="add" label={text.addOn(row.name, weekday)} size="compact" disabled={addDisabled} onClick={() => onAdd(day)} />
                  ) : null}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
