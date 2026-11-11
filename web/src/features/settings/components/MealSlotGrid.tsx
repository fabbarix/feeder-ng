import { Chip, IconButton, mealSlotIcon, weekdayLongName, weekdayShortName, type WeekStart } from '../../../ui'
import { documentLocale } from '../lib/locale'
import { slotAnchorId } from '../lib/slotAnchor'
import { weekGrid } from '../lib/weekGrid'
import { settingsStrings } from '../strings'
import type { MealSlot, Member } from '../types'
import { AttendeePills } from './AttendeePills'
import { SlotCourseLine } from './SlotCourseLine'
import '../settings.css'

export interface MealSlotGridProps {
  slots: MealSlot[]
  members: Member[]
  canEdit: boolean
  addDisabled?: boolean
  weekStart?: WeekStart
  locale?: string
  /** Admin: add a Meal Slot on this weekday, named like the row. */
  onAdd: (weekday: number, name: string) => void
  onOpen: (slot: MealSlot) => void
}

const text = settingsStrings.slot

/** The desktop week as a table: days as columns, Meal Slot names as rows. */
export function MealSlotGrid({ slots, members, canEdit, addDisabled = false, weekStart = 1, locale = documentLocale(), onAdd, onOpen }: MealSlotGridProps) {
  const grid = weekGrid(slots, weekStart)
  return (
    <div className="meal-grid-wrap">
    <table className="meal-grid" aria-label={text.gridLabel}>
      <thead>
        <tr>
          <th scope="col">
            <span className="visually-hidden">{text.gridCorner}</span>
          </th>
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
                        <span className="meal-chip__label">
                          {slot.name} <span className="meal-chip__time">{slot.time}</span>
                        </span>
                      </Chip>
                      <SlotCourseLine slot={slot} members={members} />
                      <AttendeePills slot={slot} members={members} onFix={onOpen} locale={locale} />
                    </div>
                  ) : canEdit ? (
                    <IconButton icon="add" label={text.addOn(row.name, weekday)} size="compact" disabled={addDisabled} onClick={() => onAdd(day, row.name)} />
                  ) : null}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}
