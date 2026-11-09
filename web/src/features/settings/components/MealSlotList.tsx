import { useId } from 'react'
import { Avatar, Button, EmptyState, Tile } from '../../../ui'
import { formatPortions } from '../lib/portions'
import { groupByWeekday } from '../lib/slotGroups'
import { settingsStrings } from '../strings'
import type { MealSlot, Member } from '../types'
import '../settings.css'

export interface MealSlotListProps {
  slots: MealSlot[]
  members: Member[]
  canEdit: boolean
  onAdd: () => void
  onEdit: (slot: MealSlot) => void
  /** Any User: change one date's Attendance. */
  onEditDate: (slot: MealSlot) => void
}

const text = settingsStrings.slot

/** Slots grouped under weekday headings (only weekdays that have slots). Each shows name, time, portions and
 *  Attendance avatars; buttons "Edit <name> on <weekday>" (Admin) and "Change <name> on a date" (everyone). */
export function MealSlotList({ slots, members, canEdit, onAdd, onEdit, onEditDate }: MealSlotListProps) {
  const idPrefix = useId()
  const addButton = canEdit ? <Button onClick={onAdd}>{text.add}</Button> : null
  if (slots.length === 0) {
    return <EmptyState title={text.empty} description={canEdit ? text.emptyHint : undefined} action={addButton} />
  }
  return (
    <div className="settings__stack">
      {groupByWeekday(slots).map((group) => {
        const headingId = `${idPrefix}-${group.weekday}`
        return (
          <div key={group.weekday} role="group" aria-labelledby={headingId} className="settings__stack">
            <h3 id={headingId} className="settings__heading">
              {group.name}
            </h3>
            <ul className="settings__list">
              {group.slots.map((slot) => (
                <li key={slot.id}>
                  <Tile size="wide">
                    <div className="settings__row settings__row--between">
                      <div className="settings__row">
                        <span>{slot.name}</span>
                        <span className="settings__muted">{slot.time}</span>
                        <span className="settings__muted">{formatPortions(slot.portionsNeeded)}</span>
                        {slot.attendance.map((entry) => {
                          const member = members.find((m) => m.id === entry.memberId)
                          return member ? <Avatar key={member.id} name={member.name} size="sm" /> : null
                        })}
                      </div>
                      <div className="settings__row">
                        {canEdit ? (
                          <Button variant="tonal" aria-label={text.edit(slot.name, group.name)} onClick={() => onEdit(slot)}>
                            {text.editButton}
                          </Button>
                        ) : null}
                        <Button variant="ghost" aria-label={text.changeDate(slot.name, group.name)} onClick={() => onEditDate(slot)}>
                          {text.changeDateButton}
                        </Button>
                      </div>
                    </div>
                  </Tile>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {addButton}
    </div>
  )
}
