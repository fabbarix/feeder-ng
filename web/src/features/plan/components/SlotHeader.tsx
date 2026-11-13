import type { ReactNode } from 'react'
import { IconButton, Icon } from '../../../ui'
import { timeCaption } from '../lib/slotDate'
import { slotIcon } from '../lib/hero'
import { slotHead } from '../lib/rowActions'
import { planStrings as s } from '../strings'
import type { PlanSlot, SlotDateActions, SlotDayKey, SlotKey } from '../types'
import { SlotMenu } from './SlotMenu'

export interface SlotHeaderProps {
  slot: PlanSlot
  today: string
  onCook: (key: SlotDayKey) => void
  onMarkAllCooked: (slot: SlotDayKey) => void
  onNotCookedSlot: (slot: SlotDayKey) => void
  onAddCourse: (key: SlotKey) => void
  dateActions?: SlotDateActions
}

/** The Meal Slot header row of a day tile: icon and full name (never cut), the time, then the slot's actions (Cook, ⋮) grouped at the end. */
export function SlotHeader({ slot, today, onCook, onMarkAllCooked, onNotCookedSlot, onAddCourse, dateActions }: SlotHeaderProps): ReactNode {
  const head = slotHead(slot, today, dateActions !== undefined)
  const slotKey: SlotDayKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  return (
    <div className="plan-slot-head">
      <span className="plan-slot-head__label">
        <Icon name={slotIcon(slot.name)} size={16} />
        <span className="plan-slot-head__name">{slot.name}</span>
      </span>
      <span className="plan-slot-head__time">{timeCaption(slot) ?? slot.time}</span>
      {head.cook || head.menu ? (
        <span className="plan-slot-head__actions">
          {head.cook ? <IconButton icon="cook" label={s.cook} size="compact" onClick={() => onCook(slotKey)} /> : null}
          {head.menu ? (
            <SlotMenu slot={slot} today={today} onMarkAllCooked={onMarkAllCooked} onNotCookedSlot={onNotCookedSlot} onAddCourse={onAddCourse} dateActions={dateActions} />
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
