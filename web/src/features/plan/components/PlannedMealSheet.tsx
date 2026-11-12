import type { ReactNode } from 'react'
import { Avatar, BottomSheet, Button, Chip } from '../../../ui'
import { sheetChips } from '../lib/chips'
import { mayCook, mayResolve } from '../lib/resolve'
import { planStrings as s } from '../strings'
import type { PlanSlot, SlotKey } from '../types'
import '../plan.css'

export interface PlannedMealSheetProps {
  open: boolean
  onClose: () => void
  /** The slot opened from the day tile; null while closed. */
  slot: PlanSlot | null
  /** Household date: Cook is offered for today only, Mark as Cooked for today and past (lib/resolve). */
  today: string
  onCook: (key: SlotKey) => void
  onMarkCooked: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  onPin: (key: SlotKey) => void
  onUnpin: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
  /**
   * CRS F (STUB): the Course the sheet is for (the slot's `courses` row); absent = the main Course / the slot's `meal`.
   * With several Courses the meta line reads "Tue Dinner · Side"; the facts and the Attendance avatars are the
   * Course's (the slot's Attendance without the Course's opt-outs); every action carries the key with `courseId`.
   */
  courseId?: number
  /** CRS F (STUB): the relaxed line's actions (lib/relaxed). */
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
export function PlannedMealSheet({ open, onClose, slot, today, onCook, onMarkCooked, onSwap, onPin, onUnpin, onChoose }: PlannedMealSheetProps): ReactNode {
  const meal = slot?.meal ?? null
  const key: SlotKey | null = slot ? { date: slot.date, mealSlotId: slot.mealSlotId } : null
  const planned = meal?.state === 'planned'
  const { chips, overflow } = meal && slot ? sheetChips(meal, { slotDate: slot.date }) : { chips: [], overflow: 0 }

  const actions =
    key && slot && planned
      ? [
          mayCook(slot.date, today) ? (
            <Button key="cook" variant="primary" icon="cook" onClick={() => onCook(key)}>
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
          <p className="plan-sheet__meta">{`${slot.name} · ${slot.time}`}</p>
          <p className="plan-sheet__facts">{meal.servedFromLeftover ? s.portionsNeeded(meal.portions) : s.plannedFacts(s.batches(meal.batches), s.portionsNeeded(meal.portions))}</p>
          {slot.attendance && slot.attendance.length > 0 ? (
            <div className="plan-sheet__attendance">
              {slot.attendance.map((a) => (
                <Avatar key={a.id} name={a.name} imageUrl={a.photoUrl || undefined} glyph={a.avatar || undefined} colour={a.colour} size="sm" />
              ))}
            </div>
          ) : null}
          <div className="plan-sheet__chips">
            {chips.map((c) => (
              <Chip key={c.key} kind={c.kind} status={c.status}>
                {c.label}
              </Chip>
            ))}
            {overflow > 0 ? <Chip kind="count">{`+${overflow}`}</Chip> : null}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}
