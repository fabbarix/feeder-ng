import type { ReactNode } from 'react'
import { Button, Icon } from '../../../ui'
import { notServedRowText, planAgainLabel } from '../lib/slotDate'
import { slotIcon } from '../lib/hero'
import { planStrings as s } from '../strings'
import type { PlanSlot, SlotDayKey } from '../types'
import '../plan.css'

export interface NotServedRowProps {
  slot: PlanSlot
  /** Offline: "Plan Dinner again" is disabled and says "Needs a connection". */
  offline?: boolean
  onPlanAgain: (slot: SlotDayKey) => void
}

/** The compact row of a Not served slot: "Dinner · Not served" and a "Plan Dinner again" button. No Courses, no why chips, no Couldn't plan. */
export function NotServedRow({ slot, offline = false, onPlanAgain }: NotServedRowProps): ReactNode {
  const key: SlotDayKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  return (
    <div className="plan-meal plan-meal--not-served" data-state="not-served">
      <div className="plan-meal__head">
        <span className="plan-meal__slot">
          <Icon name={slotIcon(slot.name)} size={16} />
          <span className="plan-meal__name">{notServedRowText(slot)}</span>
        </span>
      </div>
      <Button variant="tertiary" size="sm" disabled={offline} onClick={() => onPlanAgain(key)}>
        {planAgainLabel(slot)}
      </Button>
      {offline ? <span className="plan-meal__reason">{s.slotDate.needsConnection}</span> : null}
    </div>
  )
}
