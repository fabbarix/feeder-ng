import { useRef, type ReactNode } from 'react'
import { Avatar, BottomSheet, Button, Chip, FormActions, Icon, ListRow, Menu, type MenuEntry } from '../../../ui'
import { actionLabel } from '../../../lib/leftovers/rows'
import { fromLeftoverLabel } from '../../../lib/leftovers/copy'
import type { Leftover, LeftoverActionKind } from '../../../lib/leftovers/types'
import { guestsNote } from '../lib/slotDate'
import { usePhraseContext } from '../hooks/usePhraseContext'
import { useSheetTitleFocus } from '../hooks/useSheetTitleFocus'
import { sheetChips } from '../lib/chips'
import { warningContextOf } from '../lib/bought'
import { courseKey, courseOf, slotCourses } from '../lib/courses'
import { relaxedLine } from '../lib/relaxed'
import { weekdayName } from '../lib/phrase'
import { formatPortions } from '../lib/cook'
import { slotContext } from '../lib/days'
import { resolvedActionLabel, resolvedHint, resolvedSummary } from '../lib/resolved'
import { sheetActions, type SheetAction, type SheetActionId } from '../lib/rowActions'
import { leftoverBlock, leftoverBlockActions, sheetFacts, startNote } from '../lib/sheetFacts'
import { useFocusOnReplanned } from '../hooks/useFocusOnReplanned'
import type { IconName } from '../../../ui/icons'
import { planStrings as s } from '../strings'
import { undoStrings as u } from '../strings/undo'
import type { PlanSlot, SlotDayKey, SlotKey } from '../types'
import { BoughtLine } from './BoughtLine'
import { PlanChipView } from './PlanChipView'
import { RuleWarningLine } from './RuleWarningLine'
import '../plan.css'
import './PlannedMealSheet.resolved.css'

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
  /** B5-LOW: the "From Mon's Chilli" link of a meal served from a Leftover opens that Leftover (its id). */
  onOpenLeftover?: (leftoverId: number) => void
  /**
   * B9-26 (SAFE-03). The Household's IANA zone, for the time of day of "Marked Cooked today at 08:40" (left out when absent); the
   * Undo actions of a Cooked or Not cooked meal (`meal.resolution`) until the end of the household day; `offline` hides them.
   */
  timeZone?: string
  offline?: boolean
  onUndoCooked?: (key: SlotKey) => void
  onUndoNotCooked?: (key: SlotKey) => void
  onCookedAfterAll?: (key: SlotKey) => void
  /** B9-38 (PC-09): Not cooked from the footer's ⋮: acts at once, with Undo (SAFE-03). */
  onNotCooked?: (key: SlotKey) => void
  /** B9-38 (PC-09): the Leftover a Cooked meal made, for the block with Had it, Freeze it and ⋮ (undefined: no block). */
  leftover?: Leftover | null
  onLeftoverAction?: (kind: LeftoverActionKind, leftover: Leftover) => void
}

const ACTION_LABEL: Record<SheetActionId, string> = {
  cook: s.cook,
  reheat: s.reheat,
  markCooked: s.markCooked,
  notCooked: s.notCooked,
  swap: s.swap,
  pin: s.pin,
  unpin: s.unpin,
  choose: s.choose,
  undoCooked: u.undoCooked,
  cookedAfterAll: u.cookedAfterAll,
  undoNotCooked: u.undoNotCooked,
}
const ACTION_ICON: Record<SheetActionId, IconName> = {
  cook: 'cook',
  reheat: 'reheat',
  markCooked: 'markCooked',
  notCooked: 'notCooked',
  swap: 'swap',
  pin: 'pin',
  unpin: 'unpin',
  choose: 'chooseRecipe',
  undoCooked: 'undo',
  cookedAfterAll: 'markCooked',
  undoNotCooked: 'undo',
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
  onOpenLeftover,
  timeZone,
  offline = false,
  onUndoCooked,
  onUndoNotCooked,
  onCookedAfterAll,
  onNotCooked,
  leftover,
  onLeftoverAction,
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

  // The sheet opens on its title in every state (Enter must not Cook or undo); after an Undo the restored meal's Cook takes focus.
  const { bodyRef, titleRef } = useSheetTitleFocus<HTMLDivElement>()
  const cookRef = useRef<HTMLButtonElement>(null)
  useFocusOnReplanned(planned, cookRef)
  // B9-38 (PC-09, SHORT-02): one FormActions row: the ⋮ "More for Tue Dinner", the outlined secondary, the primary (lib/rowActions sheetActions).
  const set = meal && slot ? sheetActions(meal, { date: slot.date, today, offline }) : { primary: null, secondary: null, more: [] }
  const resolution = !planned ? meal?.resolution : undefined
  const run: Record<SheetActionId, () => void> = {
    cook: () => slotKey && onCook(slotKey),
    reheat: () => slotKey && onCook(slotKey),
    markCooked: () => key && onMarkCooked(key),
    notCooked: () => key && onNotCooked?.(key),
    swap: () => key && onSwap(key),
    pin: () => key && onPin(key),
    unpin: () => key && onUnpin(key),
    choose: () => key && onChoose(key),
    undoCooked: () => key && onUndoCooked?.(key),
    cookedAfterAll: () => key && onCookedAfterAll?.(key),
    undoNotCooked: () => key && onUndoNotCooked?.(key),
  }
  const labelOf = (a: SheetAction) =>
    a.id === 'undoCooked' || a.id === 'cookedAfterAll' || a.id === 'undoNotCooked'
      ? slot && key
        ? resolvedActionLabel({ id: a.id, label: ACTION_LABEL[a.id] }, slot, key.courseId)
        : ACTION_LABEL[a.id]
      : ACTION_LABEL[a.id]
  const button = (a: SheetAction, primary: boolean) => (
    <Button
      key={a.id}
      ref={a.id === 'cook' || a.id === 'reheat' ? cookRef : undefined}
      variant={primary ? 'primary' : 'secondary'}
      icon={ACTION_ICON[a.id]}
      data-one-line=""
      onClick={run[a.id]}
    >
      {labelOf(a)}
    </Button>
  )
  const moreItems: MenuEntry[] = set.more.map((a) => ({
    id: a.id,
    label: a.disabled && a.note ? s.sheet.disabledItem(ACTION_LABEL[a.id], a.note) : ACTION_LABEL[a.id],
    icon: ACTION_ICON[a.id],
    disabled: a.disabled,
    onSelect: a.disabled ? undefined : run[a.id],
  }))
  const moreLabel = slot ? s.sheet.moreFor(weekdayName(slot.date, 'short'), slot.name, several ? course?.name : undefined) : ''
  const lone = set.primary ?? set.secondary
  const footer = lone ? (
    <FormActions
      primary={button(lone, set.primary !== null)}
      secondary={set.primary && set.secondary ? button(set.secondary, false) : undefined}
      more={moreItems}
      moreLabel={moreLabel}
    />
  ) : undefined
  const context = slot ? slotContext({ date: slot.date, slotName: slot.name, time: slot.time, courseName: several ? course?.name : undefined }) : undefined
  const note = meal ? startNote(meal) : null
  const block = resolution && leftover ? leftoverBlock(leftover, today) : null
  const blockActions = resolution && leftover ? leftoverBlockActions(leftover, today) : null

  return (
    <BottomSheet
      open={open && slot !== null}
      onClose={onClose}
      title={meal?.recipeName ?? slot?.name ?? ''}
      context={context}
      footer={footer}
      initialFocusRef={titleRef}
    >
      {slot && meal ? (
        <div ref={bodyRef} className="plan-sheet">
          {resolution ? null : <p className="plan-sheet__facts">{sheetFacts(meal)}</p>}
          {meal.servedFromLeftover?.leftoverId != null && onOpenLeftover ? (
            <Button variant="secondary" size="sm" onClick={() => onOpenLeftover(meal.servedFromLeftover!.leftoverId!)}>
              {fromLeftoverLabel(meal.servedFromLeftover.date, meal.servedFromLeftover.recipeName)}
            </Button>
          ) : null}
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
          {resolution ? <p className="plan-sheet__resolved">{resolvedSummary(resolution, { today, timeZone })}</p> : null}
          {note ? <p className="plan-sheet__start-note">{note}</p> : null}
          {block && leftover && blockActions ? (
            <div className="plan-sheet__leftover" role="group" aria-label={s.sheet.leftoverOf(leftover.recipeName)}>
              <p className="plan-sheet__leftover-title">
                <Icon name="leftover" />
                {block.title}
              </p>
              <p className="plan-sheet__leftover-detail">{block.detail}</p>
              {blockActions.buttons.length + blockActions.more.length > 0 ? (
                <div className="plan-sheet__leftover-actions">
                  {blockActions.buttons.map((k) => (
                    <Button key={k} variant="secondary" icon={k === 'freeze' ? 'freezer' : undefined} onClick={() => onLeftoverAction?.(k, leftover)}>
                      {actionLabel(k)}
                    </Button>
                  ))}
                  {blockActions.more.length > 0 ? (
                    <Menu
                      label={s.sheet.leftoverMore}
                      items={blockActions.more.map((k) => ({ id: k, label: actionLabel(k), tone: k === 'threw-out' ? 'danger' : undefined, onSelect: () => onLeftoverAction?.(k, leftover) }))}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <ul className="plan-sheet__links" aria-label={s.sheet.openRecipe}>
            <ListRow
              title={s.sheet.openRecipe}
              icon="recipes"
              href={`/recipes/${meal.recipeId}`}
              meta={resolution ? s.sheet.openRecipePlain : s.sheet.openRecipeFor(formatPortions(meal.portions))}
              chevron
            />
          </ul>
          {resolution ? <p className="plan-sheet__undo-hint">{resolvedHint(resolution, { today })}</p> : null}
          <BoughtLine bought={meal.bought} />
          <RuleWarningLine warning={meal.warning} context={warningContextOf(slot, meal, course?.name)} />
          {line ? (
            <div className="plan-sheet__relaxed">
              <p className="plan__muted">{line.text}</p>
              {line.action.kind === 'markRecipes' ? (
                <Button variant="secondary" size="sm" onClick={() => onMarkRecipes(line.action.kind === 'markRecipes' ? line.action.courseId : 0)}>
                  {line.action.label}
                </Button>
              ) : line.action.kind === 'addRecipes' ? (
                <Button variant="secondary" size="sm" onClick={onAddRecipes}>
                  {line.action.label}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={onReviewVarietyRules}>
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
