import type { ReactNode } from 'react'
import { Button, Chip, Icon, IconButton } from '../../../ui'
import { causeOf, shortReason, toneOf, toneStyle } from '../lib/couldntGroups'
import { dayChip } from '../lib/chips'
import { compactAction, mayCook } from '../lib/resolve'
import { slotIcon } from '../lib/hero'
import { planStrings as s } from '../strings'
import type { PlanSlot, SlotKey } from '../types'
import '../plan.css'

export interface MealTileProps {
  slot: PlanSlot
  /** Household date: the Cook icon is offered for today's planned meal only (lib/resolve mayCook). */
  today: string
  /** Opens the Planned Meal sheet (the Recipe name is the button). */
  onOpen: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
  /** B2: Cook Mode from the tile. */
  onCook: (key: SlotKey) => void
  /** 7-column week: head row = slot icon + time, at most one action (Cook today, Swap future). */
  compact?: boolean
}

/**
 * One Planned Meal inside a day tile (ui-fix-plan 5.2), compact: row 1 = Meal Slot icon and name, trailing compact
 * IconButtons "Swap" (planned meals) and "Cook" (today's planned meal); row 2 = the Recipe name as a button that opens
 * the sheet (2-line clamp); row 3 = at most ONE chip (lib/chips dayChip). Cooked and Not cooked meals are muted
 * (data-state) and have no icon buttons. An empty slot is a dashed block (data-unfilled) with a small
 * "Not planned" chip (R13: neutral for a setup gap, amber for a rule conflict, never danger), the short reason (the
 * block's title on a compact tile) and a tertiary "Choose a Recipe". No Mark as Cooked, Pin or Confirm here: the sheet has them.
 */
export function MealTile({ slot, today, onOpen, onSwap, onChoose, onCook, compact = false }: MealTileProps): ReactNode {
  const key: SlotKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const meal = slot.meal
  const planned = meal?.state === 'planned'
  const chip = meal ? dayChip(meal, { slotDate: slot.date }) : null
  const action = compact ? (planned ? compactAction(slot.date, today) : null) : null

  return (
    <div className="plan-meal" data-state={meal && meal.state !== 'planned' ? meal.state : undefined} data-unfilled={meal ? undefined : ''} title={compact && !meal && slot.unfilled ? shortReason(causeOf(slot)) : undefined}>
      <div className="plan-meal__head">
        {compact ? (
          <span className="plan-meal__slot" aria-label={slot.name}>
            <Icon name={slotIcon(slot.name)} size={16} />
            <span className="plan-meal__name">{slot.time}</span>
          </span>
        ) : (
          <span className="plan-meal__slot">
            <Icon name={slotIcon(slot.name)} size={16} />
            <span className="plan-meal__name">{slot.name}</span>
          </span>
        )}
        {compact ? (
          action ? (
            <span className="plan-meal__actions">
              {action === 'cook' ? (
                <IconButton icon="cook" label={s.cook} size="compact" onClick={() => onCook(key)} />
              ) : (
                <IconButton icon="swap" label={s.swap} size="compact" onClick={() => onSwap(key)} />
              )}
            </span>
          ) : null
        ) : planned ? (
          <span className="plan-meal__actions">
            <IconButton icon="swap" label={s.swap} size="compact" onClick={() => onSwap(key)} />
            {mayCook(slot.date, today) ? <IconButton icon="cook" label={s.cook} size="compact" onClick={() => onCook(key)} /> : null}
          </span>
        ) : null}
      </div>
      {meal ? (
        <>
          <button type="button" className="plan-meal__recipe" onClick={() => onOpen(key)}>
            {meal.recipeName}
          </button>
          {chip ? (
            <Chip kind={chip.kind} status={chip.status}>
              {chip.label}
            </Chip>
          ) : null}
        </>
      ) : (
        <>
          {slot.unfilled ? (
            <>
              <Chip {...toneStyle(toneOf(causeOf(slot))).chip}>{s.notPlanned}</Chip>
              {compact ? null : <p className="plan-meal__reason">{shortReason(causeOf(slot))}</p>}
            </>
          ) : (
            <p className="plan-meal__reason">{s.nothingPlanned}</p>
          )}
          <Button variant="tertiary" size="sm" onClick={() => onChoose(key)}>
            {s.choose}
          </Button>
        </>
      )}
    </div>
  )
}
