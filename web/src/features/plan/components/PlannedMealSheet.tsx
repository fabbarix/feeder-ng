import type { ReactNode } from 'react'
import { Avatar, BottomSheet, Button, Chip } from '../../../ui'
import { guestsNote } from '../lib/slotDate'
import { usePhraseContext } from '../hooks/usePhraseContext'
import { sheetChips } from '../lib/chips'
import { warningContextOf } from '../lib/bought'
import { courseKey, courseOf, slotCourses } from '../lib/courses'
import { relaxedLine } from '../lib/relaxed'
import { weekdayName } from '../lib/phrase'
import { mayCook, mayResolve } from '../lib/resolve'
import { planStrings as s } from '../strings'
import type { PlanSlot, SlotDayKey, SlotKey } from '../types'
import { BoughtLine } from './BoughtLine'
import { PlanChipView } from './PlanChipView'
import { RuleWarningLine } from './RuleWarningLine'
import '../plan.css'

export interface PlannedMealSheetProps {
  open: boolean
  onClose: () => void
  /** The slot opened from the day tile; null while closed. */
  slot: PlanSlot | null
  /** Household date: Cook is offered for today only, Mark as Cooked for today and past (lib/resolve). */
  today: string
  onCook: (key: SlotDayKey) => void
  onMarkCooked: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  onPin: (key: SlotKey) => void
  onUnpin: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
  /**
   * The Course the sheet is for (the slot's `courses` row); absent = the main Course. With several Courses the meta line
   * reads "Tue Dinner · Side"; the facts and the Attendance avatars are the Course's (the slot's Attendance without the
   * Course's opt-outs); every action carries the key with `courseId`, except Cook, which is the slot's.
   */
  courseId: number
  /** The relaxed line's actions (lib/relaxed). */
  onMarkRecipes?: (courseId: number) => void
  onAddRecipes?: () => void
  onReviewVarietyRules?: () => void
}

/**
 * The Planned Meal sheet (ui-fix-plan 2.4, 5.2): title = Recipe name; meta line "Dinner · 19:00" and the facts
 * "1 Batch · 3.5 portions"; Attendance avatars when the slot has them; up to 3 chips plus a "+N" count chip
 * (lib/chips sheetChips); actions in this order: Cook (primary, today, planned only), Mark as Cooked (today and past,
 * planned only), Swap, Pin or Unpin (planned only), Choose a Recipe. A Cooked or Not cooked meal has no actions.
 */
export function PlannedMealSheet({
  open,
  onClose,
  slot,
  today,
  courseId,
  onCook,
  onMarkCooked,
  onSwap,
  onPin,
  onUnpin,
  onChoose,
  onMarkRecipes = () => {},
  onAddRecipes = () => {},
  onReviewVarietyRules = () => {},
}: PlannedMealSheetProps): ReactNode {
  const course = slot ? courseOf(slot, courseId) : undefined
  const meal = course?.meal ?? null
  const several = slot ? slotCourses(slot).length > 1 : false
  const key: SlotKey | null = slot && course ? courseKey(slot, course) : null
  const slotKey: SlotDayKey | null = slot ? { date: slot.date, mealSlotId: slot.mealSlotId } : null
  const planned = meal?.state === 'planned'
  const phrase = usePhraseContext(slot?.date ?? '')
  const { chips, overflow } = meal && slot ? sheetChips(meal, phrase) : { chips: [], overflow: 0 }
  const line = meal && slot && course ? relaxedLine(meal, { courseId: course.courseId, courseName: course.name, main: course.main, severalCourses: several }) : null
  const attendance = slot?.attendance?.filter((a) => !course?.optOutMemberIds.includes(a.id))
  const guests = slot?.guests ?? 0
  const guestsText = guestsNote(attendance?.length ?? 0, guests)

  const actions =
    key && slot && planned
      ? [
          mayCook(slot.date, today) ? (
            <Button key="cook" variant="primary" icon="cook" onClick={() => onCook(slotKey!)}>
              {s.cook}
            </Button>
          ) : null,
          mayResolve(slot.date, today) ? (
            <Button key="mark" variant="secondary" icon="markCooked" onClick={() => onMarkCooked(key)}>
              {s.markCooked}
            </Button>
          ) : null,
          <Button key="swap" variant="secondary" icon="swap" onClick={() => onSwap(key)}>
            {s.swap}
          </Button>,
          meal?.pinned ? (
            <Button key="unpin" variant="secondary" icon="unpin" onClick={() => onUnpin(key)}>
              {s.unpin}
            </Button>
          ) : (
            <Button key="pin" variant="secondary" icon="pin" onClick={() => onPin(key)}>
              {s.pin}
            </Button>
          ),
          <Button key="choose" variant="tertiary" icon="chooseRecipe" onClick={() => onChoose(key)}>
            {s.choose}
          </Button>,
        ].filter((a) => a !== null)
      : []

  return (
    <BottomSheet
      open={open && slot !== null}
      onClose={onClose}
      title={meal?.recipeName ?? slot?.name ?? ''}
      footer={actions.length > 0 ? <div className="plan-sheet__actions">{actions}</div> : undefined}
    >
      {slot && meal ? (
        <div className="plan-sheet">
          <p className="plan-sheet__meta">{several && course ? `${weekdayName(slot.date, 'short')} ${slot.name} · ${course.name}` : `${slot.name} · ${slot.time}`}</p>
          <p className="plan-sheet__facts">{meal.servedFromLeftover ? s.portionsNeeded(meal.portions) : s.plannedFacts(s.batches(meal.batches), s.portionsNeeded(meal.portions))}</p>
          {(attendance && attendance.length > 0) || guests > 0 ? (
            <div className="plan-sheet__attendance">
              {attendance?.map((a) => (
                <Avatar key={a.id} name={a.name} imageUrl={a.photoUrl || undefined} glyph={a.avatar || undefined} colour={a.colour} size="sm" />
              ))}
              {/* B5-F1: Guests end the attendees ("+2 Guests"; "2 Guests" with no Member). */}
              {guestsText ? <span className="plan-sheet__guests">{guestsText}</span> : null}
            </div>
          ) : null}
          <div className="plan-sheet__chips">
            {chips.map((c) => (
              <PlanChipView key={c.key} chip={c} />
            ))}
            {overflow > 0 ? <Chip kind="count">{`+${overflow}`}</Chip> : null}
          </div>
          <BoughtLine bought={meal.bought} />
          <RuleWarningLine warning={meal.warning} context={warningContextOf(slot, meal, course?.name)} />
          {line ? (
            <div className="plan-sheet__relaxed">
              <p className="plan__muted">{line.text}</p>
              {line.action.kind === 'markRecipes' ? (
                <Button variant="tertiary" size="sm" onClick={() => onMarkRecipes(line.action.kind === 'markRecipes' ? line.action.courseId : 0)}>
                  {line.action.label}
                </Button>
              ) : line.action.kind === 'addRecipes' ? (
                <Button variant="tertiary" size="sm" onClick={onAddRecipes}>
                  {line.action.label}
                </Button>
              ) : (
                <Button variant="tertiary" size="sm" onClick={onReviewVarietyRules}>
                  {line.action.label}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  )
}
