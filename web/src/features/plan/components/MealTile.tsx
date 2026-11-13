import type { ReactNode } from 'react'
import { Button, Chip, Icon, IconButton } from '../../../ui'
import { causeOf, shortReason, toneOf, toneStyle } from '../lib/couldntGroups'
import { usePhraseContext } from '../hooks/usePhraseContext'
import { dayChip } from '../lib/chips'
import { courseKey, courseRows, plannedMeals, slotCourses, slotMenu, type CourseRowModel } from '../lib/courses'
import { compactAction, mayCook } from '../lib/resolve'
import { slotIcon } from '../lib/hero'
import { planStrings as s } from '../strings'
import type { PlannedMeal, PlanSlot, SlotDateActions, SlotDayKey, SlotKey, Unfilled } from '../types'
import { CourseRow } from './CourseRow'
import { SlotMenu } from './SlotMenu'
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
  onCook: (key: SlotDayKey) => void
  /** 7-column week: head row = slot icon + time, at most one action (Cook today, Swap future). */
  compact?: boolean
  /** The slot menu's actions; the menu shows only for a slot that has them (lib/courses slotMenu). */
  onMarkAllCooked?: (slot: SlotDayKey) => void
  onNotCookedSlot?: (slot: SlotDayKey) => void
  onAddCourse?: (key: SlotKey) => void
  /** B5-F1: the per-date choices (slot menu entries, Plan <Slot> again on a Not served slot); a Not served slot shows NotServedRow, a date with its own time shows "20:15 · usually 19:30". */
  dateActions?: SlotDateActions
}

/**
 * One Planned Meal inside a day tile (ui-fix-plan 5.2), compact: row 1 = Meal Slot icon and name, trailing compact
 * IconButtons "Swap" (planned meals) and "Cook" (today's planned meal); row 2 = the Recipe name as a button that opens
 * the sheet (2-line clamp); row 3 = at most ONE chip (lib/chips dayChip). Cooked and Not cooked meals are muted
 * (data-state) and have no icon buttons. An empty slot is a dashed block (data-unfilled) with a small
 * "Not planned" chip (R13: neutral for a setup gap, amber for a rule conflict, never danger), the short reason (the
 * block's title on a compact tile) and a tertiary "Choose a Recipe". No Mark as Cooked, Pin or Confirm here: the sheet has them.
 */
export function MealTile(props: MealTileProps): ReactNode {
  const { slot, today, compact = false, onCook, onMarkAllCooked = noop, onNotCookedSlot = noop, onAddCourse = noop } = props
  const rows = courseRows(slot)
  if (slotCourses(slot).length > 1 && rows.length > 0) {
    return (
      <SeveralCourses
        slot={slot}
        rows={rows}
        today={today}
        compact={compact}
        onOpen={props.onOpen}
        onSwap={props.onSwap}
        onChoose={props.onChoose}
        onCook={onCook}
        onMarkAllCooked={onMarkAllCooked}
        onNotCookedSlot={onNotCookedSlot}
        onAddCourse={onAddCourse}
      />
    )
  }
  // One row: the single-Recipe block of that Course; no row: the main Course's own meal and reason (none when it has none).
  const lone = rows[0]
  const single = lone ? lone.course : slotCourses(slot).find((c) => c.main)
  if (!single) return null
  const key: SlotKey = lone ? lone.key : courseKey(slot, single)
  const menu = compact ? null : slotMenu(slot, today)
  return (
    <SingleTile
      slot={slot}
      meal={single?.meal ?? null}
      unfilled={single?.unfilled ?? null}
      keyOf={key}
      today={today}
      compact={compact}
      onOpen={props.onOpen}
      onSwap={props.onSwap}
      onChoose={props.onChoose}
      onCook={onCook}
      menu={menu ? <SlotMenu slot={slot} today={today} onMarkAllCooked={onMarkAllCooked} onNotCookedSlot={onNotCookedSlot} onAddCourse={onAddCourse} /> : null}
    />
  )
}

const noop = () => {}

interface SingleTileProps {
  slot: PlanSlot
  /** The Course's own Planned Meal and reason (lib/courses): the slot carries neither. */
  meal: PlannedMeal | null
  unfilled: Unfilled | null
  keyOf: SlotKey
  today: string
  compact: boolean
  onOpen: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
  onCook: (key: SlotDayKey) => void
  menu: ReactNode
}

function SingleTile({ slot, meal, unfilled, keyOf: key, today, compact, onOpen, onSwap, onChoose, onCook, menu }: SingleTileProps): ReactNode {
  const phrase = usePhraseContext(slot.date)
  const planned = meal?.state === 'planned'
  const chip = meal ? dayChip(meal, phrase) : null
  const action = compact ? (planned ? compactAction(slot.date, today) : null) : null

  return (
    <div className="plan-meal" data-state={meal && meal.state !== 'planned' ? meal.state : undefined} data-unfilled={meal ? undefined : ''} title={compact && !meal && unfilled ? shortReason(causeOf({ unfilled })) : undefined}>
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
        {menu}
      </div>
      {meal ? (
        <>
          <button type="button" className="plan-meal__recipe" title={meal.recipeName} onClick={() => onOpen(key)}>
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
          {unfilled ? (
            <>
              <span className="plan-meal__status">
                <Chip {...toneStyle(toneOf(causeOf({ unfilled }))).chip}>{s.notPlanned}</Chip>
              </span>
              {compact ? null : <p className="plan-meal__reason">{shortReason(causeOf({ unfilled }))}</p>}
            </>
          ) : (
            <p className="plan-meal__reason">{s.nothingPlanned}</p>
          )}
          {unfilled && causeOf({ unfilled }) === 'nobody_attending' ? null : (
            <Button variant="tertiary" size="sm" onClick={() => onChoose(key)}>
              {s.choose}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

interface SeveralCoursesProps {
  slot: PlanSlot
  rows: CourseRowModel[]
  today: string
  compact: boolean
  onOpen: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
  onCook: (key: SlotDayKey) => void
  onMarkAllCooked: (slot: SlotDayKey) => void
  onNotCookedSlot: (slot: SlotDayKey) => void
  onAddCourse: (key: SlotKey) => void
}

/**
 * A slot with several Course rows (spec 7.5): the slot named once, Cook once on the head (it opens the slot's timeline),
 * then a list of Course rows, each with its own Swap (a compact week shows none), and the slot menu.
 */
function SeveralCourses({ slot, rows, today, compact, onOpen, onSwap, onChoose, onCook, onMarkAllCooked, onNotCookedSlot, onAddCourse }: SeveralCoursesProps): ReactNode {
  const slotKey: SlotDayKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const cookable = plannedMeals(slot).length > 0 && (compact ? compactAction(slot.date, today) === 'cook' : mayCook(slot.date, today))
  return (
    <div className="plan-meal plan-meal--courses">
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
        {cookable ? (
          <span className="plan-meal__actions">
            <IconButton icon="cook" label={s.cook} size="compact" onClick={() => onCook(slotKey)} />
          </span>
        ) : null}
        {compact ? null : <SlotMenu slot={slot} today={today} onMarkAllCooked={onMarkAllCooked} onNotCookedSlot={onNotCookedSlot} onAddCourse={onAddCourse} />}
      </div>
      <ul aria-label={`${slot.name} Courses`} className="plan-meal__courses">
        {rows.map((row) => (
          <CourseRow
            key={row.course.courseId}
            row={row}
            slot={slot}
            today={today}
            compact={compact}
            actions={compact ? [] : ['swap']}
            onOpen={onOpen}
            onSwap={onSwap}
            onChoose={onChoose}
          />
        ))}
      </ul>
    </div>
  )
}
