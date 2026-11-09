import type { ReactNode } from 'react'
import { Button, Chip, Tile, WhyChip } from '../../../ui'
import { couldntPlanText } from '../lib/couldnt'
import { leftoverRows } from '../lib/leftovers'
import { phraseAll, weekdayName } from '../lib/phrase'
import { planStrings } from '../strings'
import type { Leftover, PlanSlot, SlotKey } from '../types'
import '../plan.css'

const keyOf = (s: PlanSlot): SlotKey => ({ date: s.date, mealSlotId: s.mealSlotId })

export interface NextMealTileProps {
  /** From lib/days.nextMeal; null shows "Nothing planned". */
  slot: PlanSlot | null
  onOpen?: (key: SlotKey) => void
}

/** Today: the next meal to cook, with its Recipe, Meal Slot, time and first why chip. */
export function NextMealTile({ slot, onOpen }: NextMealTileProps): ReactNode {
  const onClick = slot && onOpen ? () => onOpen(keyOf(slot)) : undefined
  const why = slot?.meal ? phraseAll(slot.meal.why, { slotDate: slot.date })[0] : undefined
  return (
    <Tile size="md" tone="accent" onClick={onClick} aria-label={onClick ? planStrings.nextMealTitle : undefined}>
      <p className="plan-meal__slot">{planStrings.nextMealTitle}</p>
      {slot?.meal ? (
        <div className="plan__stack">
          <p className="plan-meal__recipe">{slot.meal.recipeName}</p>
          <p className="plan-meal__slot">
            {slot.name} · {slot.time}
          </p>
          {why ? <WhyChip reason={why} /> : null}
        </div>
      ) : (
        <p className="plan-meal__recipe">{planStrings.nextMealNone}</p>
      )}
    </Tile>
  )
}

export interface ToConfirmTileProps {
  slots: PlanSlot[]
  onCooked: (key: SlotKey) => void
  onNotCooked: (key: SlotKey) => void
}

/** Today: meals still unconfirmed two hours after their slot time. Renders nothing when there are none. */
export function ToConfirmTile({ slots, onCooked, onNotCooked }: ToConfirmTileProps): ReactNode {
  if (slots.length === 0) return null
  return (
    <Tile as="section" size="full">
      <h2 className="plan__tile-title">{planStrings.toConfirmTitle}</h2>
      <p className="plan__muted">{planStrings.toConfirmHelp}</p>
      <ul className="plan__list">
        {slots.map((s) => (
          <li key={`${s.date}/${s.mealSlotId}`}>
            <div className="plan__stack">
              <p className="plan-meal__recipe">{s.meal?.recipeName}</p>
              <p className="plan-meal__slot">{planStrings.mealLabel(weekdayName(s.date), s.name.toLowerCase())}</p>
            </div>
            <div className="plan__row">
              <Button variant="tonal" onClick={() => onCooked(keyOf(s))}>
                {planStrings.markCooked}
              </Button>
              <Button variant="ghost" onClick={() => onNotCooked(keyOf(s))}>
                {planStrings.notCooked}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Tile>
  )
}

export interface CouldntPlanNoticeProps {
  slots: PlanSlot[]
}

/** Today: "Couldn't plan Thursday dinner: ..." for each slot the planner left empty. Renders nothing when there are none. */
export function CouldntPlanNotice({ slots }: CouldntPlanNoticeProps): ReactNode {
  if (slots.length === 0) return null
  return (
    <Tile size="full" tone="spoil" role="status">
      <ul className="plan__list">
        {slots.map((s) => (
          <li key={`${s.date}/${s.mealSlotId}`}>{couldntPlanText(s)}</li>
        ))}
      </ul>
    </Tile>
  )
}

export interface LeftoversTileProps {
  leftovers: Leftover[]
  today: string
}

/** Today: the Leftovers to use, soonest Use-by first. Renders nothing when there are none. */
export function LeftoversTile({ leftovers, today }: LeftoversTileProps): ReactNode {
  if (leftovers.length === 0) return null
  return (
    <Tile as="section" size="md">
      <h2 className="plan__tile-title">{planStrings.leftoversTitle}</h2>
      <ul className="plan__list">
        {leftoverRows(leftovers, today).map((r) => (
          <li key={r.id}>
            <span>
              <strong>{r.recipeName}</strong> <span className="plan__muted">{r.portions}</span>
            </span>
            <Chip tone={r.tone}>{r.useBy}</Chip>
          </li>
        ))}
      </ul>
    </Tile>
  )
}
