import type { ReactNode } from 'react'
import { IconButton, Icon } from '../../../ui'
import { IconSet } from '../../../ui/IconSet'
import { actionName, dayLabel } from '../lib/actionNames'
import { timeCaption } from '../lib/slotDate'
import { slotIcon } from '../lib/hero'
import { slotHead } from '../lib/rowActions'
import type { PlanSlot, SlotDateActions, SlotDayKey, SlotKey } from '../types'
import { SlotAwayLabel } from './SlotAwayLabel'
import { SlotMenu } from './SlotMenu'

export interface SlotHeaderProps {
  slot: PlanSlot
  today: string
  onCook: (key: SlotDayKey) => void
  onMarkAllCooked: (slot: SlotDayKey) => void
  onNotCookedSlot: (slot: SlotDayKey) => void
  onAddCourse: (key: SlotKey) => void
  dateActions?: SlotDateActions
  /** B9-46 (PC-08): "Ben away" (info text) or the info chip "Everyone is away", after the time. */
  awayLabel?: { text: string; everyone: boolean }
}

/** The Meal Slot header row of a day tile: icon and full name (never cut), the time, then the slot's actions (Cook, ⋮) grouped at the end. */
export function SlotHeader({ slot, today, onCook, onMarkAllCooked, onNotCookedSlot, onAddCourse, dateActions, awayLabel }: SlotHeaderProps): ReactNode {
  const head = slotHead(slot, today, dateActions !== undefined)
  const slotKey: SlotDayKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const day = dayLabel(slot.date)
  return (
    <div className="plan-slot-head">
      <span className="plan-slot-head__label">
        <Icon name={slotIcon(slot.name)} size={16} />
        <span className="plan-slot-head__name">{slot.name}</span>
        {awayLabel ? <SlotAwayLabel text={awayLabel.text} everyone={awayLabel.everyone} /> : null}
      </span>
      <span className="plan-slot-head__time">{timeCaption(slot) ?? slot.time}</span>
      {head.cook || head.menu ? (
        <IconSet className="plan-slot-head__actions">
          {head.cook ? <IconButton icon="cook" label={actionName('cook', { day, slot: slot.name })} size="compact" onClick={() => onCook(slotKey)} /> : null}
          {head.menu ? (
            <SlotMenu slot={slot} today={today} dayLabel={day} onMarkAllCooked={onMarkAllCooked} onNotCookedSlot={onNotCookedSlot} onAddCourse={onAddCourse} dateActions={dateActions} size="compact" />
          ) : null}
        </IconSet>
      ) : null}
    </div>
  )
}
