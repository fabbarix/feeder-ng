import type { ReactNode } from 'react'
import { Button, Chip, WhyChip } from '../../../ui'
import { couldntPlanText } from '../lib/couldnt'
import { phraseAll, weekdayName } from '../lib/phrase'
import { planStrings } from '../strings'
import type { PlanSlot, SlotKey } from '../types'
import '../plan.css'

export interface MealTileProps {
  slot: PlanSlot
  onSwap: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
  onConfirm: (key: SlotKey) => void
  onUnpin: (key: SlotKey) => void
  onMarkCooked: (key: SlotKey) => void
  /** Household date; Mark as Cooked is offered only when lib/resolve mayResolve(slot.date, today). */
  today: string
}

/**
 * One Planned Meal in a Meal Slot: Recipe, Batches, portions, phrased why chips, state (Pinned, Leftover, Cooked,
 * not cooked) and the actions that fit the state. An empty slot shows its "couldn't plan" reason and "Choose a Recipe".
 * Renders and wires events only; the wording comes from lib/.
 */
export function MealTile({ slot, onSwap, onChoose, onConfirm, onUnpin, onMarkCooked }: MealTileProps): ReactNode {
  const key: SlotKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const meal = slot.meal
  const heading = (
    <p className="plan-meal__slot">
      {slot.name} · {slot.time}
    </p>
  )

  if (!meal) {
    return (
      <div className="plan-meal">
        {heading}
        <p className="plan-meal__reason">{slot.unfilled ? couldntPlanText(slot) : planStrings.nothingPlanned}</p>
        <div className="plan__row">
          <Button variant="tonal" onClick={() => onChoose(key)}>
            {planStrings.choose}
          </Button>
        </div>
      </div>
    )
  }

  const open = meal.state === 'planned'
  const phrases = phraseAll(meal.why, { slotDate: slot.date })
  return (
    <div className="plan-meal">
      {heading}
      <p className="plan-meal__recipe">{meal.recipeName}</p>
      <div className="plan__row">
        {meal.servedFromLeftover ? (
          <Chip tone="leftover">{planStrings.servedFromLeftover(weekdayName(meal.servedFromLeftover.date))}</Chip>
        ) : (
          <Chip>{planStrings.batches(meal.batches)}</Chip>
        )}
        <Chip>{planStrings.portionsNeeded(meal.portions)}</Chip>
        {meal.pinned && open ? <Chip tone="accent">{planStrings.pinned}</Chip> : null}
        {meal.state === 'cooked' ? <Chip tone="accent">{planStrings.cooked}</Chip> : null}
        {meal.state === 'skipped' ? <Chip>{planStrings.skipped}</Chip> : null}
      </div>
      {phrases.length > 0 ? (
        <div className="plan__row">
          {phrases.map((p) => (
            <WhyChip key={p} reason={p} />
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="plan__row">
          <Button variant="ghost" onClick={() => onSwap(key)}>
            {planStrings.swap}
          </Button>
          {meal.pinned ? (
            <Button variant="ghost" onClick={() => onUnpin(key)}>
              {planStrings.unpin}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onConfirm(key)}>
              {planStrings.confirm}
            </Button>
          )}
          <Button variant="tonal" onClick={() => onMarkCooked(key)}>
            {planStrings.markCooked}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
