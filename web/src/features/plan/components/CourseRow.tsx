import type { ReactNode } from 'react'
import { Button, Chip, IconButton, Menu } from '../../../ui'
import { usePhraseContext } from '../hooks/usePhraseContext'
import { dayChip } from '../lib/chips'
import { causeOf, shortReason, toneOf, toneStyle } from '../lib/couldntGroups'
import { wholeMealChip, type CourseRowModel } from '../lib/courses'
import { mayResolve } from '../lib/resolve'
import { planStrings as s } from '../strings'
import { PlanChipView } from './PlanChipView'
import type { PlanSlot, SlotKey } from '../types'
import './CourseRow.css'

/** `cooked` is a loose Mark as Cooked icon; `more` puts Mark as Cooked in the row's ⋮ (DS-TODAY hero). */
export type CourseAction = 'swap' | 'pin' | 'cooked' | 'more'

/** What a Course row can do; every handler gets the key of that Course's Planned Meal (courseId included). */
export interface CourseRowHandlers {
  /** The Recipe name is a button that opens the Planned Meal sheet of the Course. */
  onOpen: (key: SlotKey) => void
  onSwap?: (key: SlotKey) => void
  onPin?: (key: SlotKey) => void
  onUnpin?: (key: SlotKey) => void
  /** Opens the Mark as Cooked sheet of the Course. */
  onMarkCooked?: (key: SlotKey) => void
  /** An empty row's "Choose a Recipe". */
  onChoose?: (key: SlotKey) => void
}

export interface CourseRowProps extends CourseRowHandlers {
  row: CourseRowModel
  slot: PlanSlot
  /** Household date: Mark as Cooked is offered for today and past only (lib/resolve mayResolve). */
  today: string
  /** Which icon buttons the row offers, in this order, on a planned meal. Default ['swap']. */
  actions?: CourseAction[]
  /** The small row of Today's hero block and of the 7-column week. */
  compact?: boolean
  /** On the accent hero: an empty row's "Choose a Recipe" is a surface button (secondary), not accent text (tertiary). */
  onAccent?: boolean
}

/**
 * One Course of a slot block: `<li aria-label="{Course name}">` with the caption, the Recipe name as a button, the day
 * chip (lib/chips dayChip) and the "Whole meal" chip, and compact IconButtons for a planned meal, per `actions`. An
 * empty row is the dashed "Not planned" block with "Choose a Recipe". Cooked and Not cooked rows are muted, no buttons.
 */
export function CourseRow({ row, slot, today, actions = ['swap'], compact = false, onAccent = false, onOpen, onSwap, onPin, onUnpin, onMarkCooked, onChoose }: CourseRowProps): ReactNode {
  const { course, key, caption } = row
  const meal = course.meal
  const planned = meal?.state === 'planned'
  const phrase = usePhraseContext(slot.date)
  const chip = meal ? dayChip(meal, phrase) : null
  const whole = wholeMealChip(slot, row)
  // CRS G2 (spec 7.4, "On Plan"): an empty Course says why, in the tone of its cause.
  const reason = !meal && course.unfilled !== null
  const cause = causeOf(course)

  return (
    <li aria-label={course.name} className="plan-course" data-compact={compact ? 'true' : undefined}>
      {caption ? <span className="plan-course__caption">{caption}</span> : null}
      <div
        className="plan-course__body"
        data-state={meal && meal.state !== 'planned' ? meal.state : undefined}
        data-unfilled={meal ? undefined : ''}
        title={compact && reason ? shortReason(cause) : undefined}
      >
        {meal ? (
          <>
            <button type="button" className="plan-meal__recipe" title={meal.recipeName} onClick={() => onOpen(key)}>
              {meal.recipeName}
            </button>
            <span className="plan-course__chips">
              {chip ? <PlanChipView chip={chip} /> : null}
              {whole ? (
                <Chip kind={whole.kind} status={whole.status}>
                  {whole.label}
                </Chip>
              ) : null}
            </span>
            {planned ? (
              <span className="plan-course__actions" role="group" aria-label={`${course.name} actions`}>
                {actions.includes('swap') ? <IconButton icon="swap" label={s.swap} size="compact" onClick={() => onSwap?.(key)} /> : null}
                {actions.includes('pin') ? (
                  meal.pinned ? (
                    <IconButton icon="unpin" label={s.unpin} size="compact" onClick={() => onUnpin?.(key)} />
                  ) : (
                    <IconButton icon="pin" label={s.pin} size="compact" onClick={() => onPin?.(key)} />
                  )
                ) : null}
                {actions.includes('cooked') && mayResolve(meal.date, today) ? (
                  <IconButton icon="markCooked" label={s.markCooked} size="compact" onClick={() => onMarkCooked?.(key)} />
                ) : null}
                {actions.includes('more') && mayResolve(meal.date, today) ? (
                  <Menu label={`More for ${course.name}`} items={[{ id: 'cooked', label: s.markCooked, onSelect: () => onMarkCooked?.(key) }]} />
                ) : null}
              </span>
            ) : null}
          </>
        ) : (
          <>
            {reason ? <Chip {...toneStyle(toneOf(cause)).chip}>{s.notPlanned}</Chip> : <Chip>{s.notPlanned}</Chip>}
            {reason && !compact ? <span className="plan-course__reason">{shortReason(cause)}</span> : null}
            {/* CRS G2: nobody attends, so there is nobody to cook for (as a lone slot). */}
            {cause !== 'nobody_attending' ? (
              <Button variant={onAccent ? 'secondary' : 'tertiary'} size="sm" onClick={() => onChoose?.(key)}>
                {s.choose}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </li>
  )
}
