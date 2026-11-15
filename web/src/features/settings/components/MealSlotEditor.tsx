import { useId, useRef, type MouseEvent } from 'react'
import type { CourseChoice } from '../../../lib/courses'
import { BottomSheet, Button, Chip, FieldRow, FormActions, TimeField, TextField, WeekdayPicker, type MenuEntry } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { useSlotForm } from '../hooks/useSlotForm'
import { documentLocale } from '../lib/locale'
import { matchingSlots, sameDays } from '../lib/multiDay'
import { settingsStrings } from '../strings'
import type { MealSlot, MealSlotInput, Member, SlotBatchRequest, SlotBatchResult } from '../types'
import { coursesStrings } from '../coursesStrings'
import { AttendanceEditor } from './AttendanceEditor'
import { SlotCoursesField } from './SlotCoursesField'
import '../settings.css'

export interface MealSlotEditorProps {
  open: boolean
  slot?: MealSlot
  members: Member[]
  /** Add mode starts with these weekdays chosen (ISO 1..7), e.g. the weekday whose add button was pressed. */
  defaultWeekdays?: number[]
  /** Add mode starts with this Name (the grid row whose add button was pressed). */
  defaultName?: string
  saving?: boolean
  error?: string
  /** Adding: one body per chosen weekday. */
  onSave: (inputs: MealSlotInput[]) => void | Promise<void>
  /** R15, editing: every Meal Slot in the household (to match by name) and the one-call batch save. */
  slots?: MealSlot[]
  onApply?: (request: SlotBatchRequest) => void | Promise<void>
  weekStart?: 1 | 6 | 7
  /** SET-14h, editing: the weekdays "Apply to" starts with (a card: every day of the name); absent, the slot's own day. */
  initialWeekdays?: number[]
  /** CRS D2: the household's active Courses (household order). Given, the editor shows the Courses field; absent or empty, it does not. */
  courses?: CourseChoice[]
  /** CRS D2, editing: a dry run of the batch (`dryRun: true`), asked while the Admin takes Courses off, to name what goes. */
  onPreview?: (request: SlotBatchRequest) => Promise<SlotBatchResult>
  locale?: string
  /**
   * Editing only: "Remove Meal Slot" in the ⋮ (danger tone), given the weekdays ticked in the sheet at that moment (B9-42: Remove
   * acts on them, like Save). The page asks the confirm; unsaved edits are dropped with the sheet, the confirm is the question.
   */
  onDelete?: (weekdays: number[]) => void | Promise<void>
  /** Editing only: "Change a date" in the ⋮, the one-date Attendance for this slot. */
  onChangeDate?: () => void
  onClose: () => void
}

const text = settingsStrings.slot

/**
 * A BottomSheet "Add Meal Slot" / "Edit Meal Slot". Adding: "Days" chips; editing: "Apply to" chips (the same name on the
 * other days gets the same change, one save), quick picks, Name, Usual time, AttendanceEditor and a "What will change" summary.
 * SHORT-02 / R-B: the footer is one row, [⋮ "More for Dinner"] [Cancel] [Save Meal Slot] (adding: [Cancel] [Add Meal Slot]), and the
 * header has no Close. Unsaved changes make every way out ask "Discard changes?" first (the sheet's own question).
 */
export function MealSlotEditor({ open, slot, onClose, ...rest }: MealSlotEditorProps) {
  return open ? <EditorSheet slot={slot} onClose={onClose} {...rest} /> : null
}

type SheetProps = Omit<MealSlotEditorProps, 'open'>

/** Keyed on the slot and on whether the household has Courses, not on how many: a live Course added elsewhere must not drop an open draft. */
function EditorSheet(props: SheetProps) {
  return <SlotSheet key={`${props.slot?.id ?? 'new'}|${(props.courses?.length ?? 0) > 0 ? 'courses' : 'none'}`} {...props} />
}

/**
 * The Cancel of a footer the page draws itself goes out the way Escape does: the dialog's own `cancel` event, so the sheet asks
 * "Discard changes?" when the form holds edits (BottomSheet `confirmDismiss`) and closes at once when it does not.
 */
function cancelSheet(event: MouseEvent<HTMLButtonElement>) {
  event.currentTarget.closest('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }))
}

function SlotSheet({ slot, members, defaultWeekdays, defaultName, saving, error, onSave, slots, onApply, weekStart, initialWeekdays, courses, onPreview, locale = documentLocale(), onDelete, onChangeDate, onClose }: SheetProps) {
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const { draft, set, weekdays, setWeekdays, picks, summary, problem, submit, coursesError, removal, dirty, submitCount } = useSlotForm({
    slot,
    members,
    defaultWeekdays,
    defaultName,
    slots,
    initialWeekdays,
    courses,
    onPreview,
    locale,
    onSave,
    onApply,
  })
  useFocusFirstInvalid(formRef, problem && problem.field !== 'form' ? { [problem.field]: problem.message } : null, submitCount)
  const showCourses = courses !== undefined && courses.length > 0
  const fieldError = (field: 'weekdays' | 'name' | 'time') => (problem?.field === field ? problem.message : undefined)
  const formProblem = problem?.field === 'form' ? problem.message : undefined
  const shownError = formProblem ?? error
  const name = (slot?.name ?? '').trim()

  const more: MenuEntry[] = []
  if (slot && onChangeDate) more.push({ id: 'change-date', label: text.changeDateButton, onSelect: onChangeDate })
  // Remove needs at least one ticked day the name runs on.
  const removable = slot ? matchingSlots(slots ?? [slot], slot.name, weekdays).matched.length > 0 : false
  if (slot && onDelete) more.push({ id: 'remove', label: text.remove, tone: 'danger', disabled: saving || !removable, onSelect: () => void onDelete([...weekdays]) })

  return (
    <BottomSheet
      open
      onClose={onClose}
      closeButton={false}
      confirmDismiss={dirty}
      title={slot ? text.editTitle : text.addTitle}
      footer={
        <FormActions
          more={more.length > 0 ? more : undefined}
          moreLabel={text.moreFor(name)}
          tertiary={
            <Button variant="secondary" className="sheet__cancel" onClick={cancelSheet}>
              {text.cancel}
            </Button>
          }
          primary={
            <Button type="submit" form={formId} loading={saving}>
              {slot ? text.save : text.addSave}
            </Button>
          }
        />
      }
    >
      <form ref={formRef} id={formId} className="settings__stack" onSubmit={submit} noValidate>
        <WeekdayPicker
          label={slot ? text.applyTo : text.days}
          value={weekdays}
          onChange={setWeekdays}
          weekStart={weekStart}
          locale={locale}
          error={fieldError('weekdays')}
        />
        <div className="meal-slot-quickpicks">
          {picks.map((pick) => (
            <Chip key={pick.id} kind="filter" selected={sameDays(weekdays, pick.days)} onClick={() => setWeekdays(pick.days)}>
              {pick.label}
            </Chip>
          ))}
        </div>
        <FieldRow>
          <TextField label={text.name} value={draft.name} onChange={(next) => set({ name: next })} error={fieldError('name')} />
          <TimeField size="sm" label={text.time} value={draft.time} onChange={(time) => set({ time })} error={fieldError('time')} />
        </FieldRow>
        <AttendanceEditor members={members} value={draft.attendance} onChange={(attendance) => set({ attendance })} />
        {showCourses && draft.courses ? (
          <SlotCoursesField
            courses={courses}
            members={members}
            attendance={draft.attendance}
            value={draft.courses}
            onChange={(next) => set({ courses: next })}
            error={coursesError}
          />
        ) : null}
        {summary ? (
          <ul className="meal-slot-summary" role="list" aria-label={text.willChange} aria-live="polite">
            {summary.update ? <li>{summary.update}</li> : null}
            {summary.skipped.map((line) => (
              <li key={line} className="meal-slot-summary__skipped">
                {line}
              </li>
            ))}
            {removal.lines?.lines.map((line) => <li key={line}>{line}</li>)}
            {removal.lines && removal.lines.pinned.length > 0 ? <li className="meal-slot-summary__pinned">{coursesStrings.slot.pinnedHeading}</li> : null}
            {removal.lines?.pinned.map((line) => (
              <li key={`pinned-${line}`}>{line}</li>
            ))}
            {removal.status === 'loading' ? <li>{coursesStrings.slot.previewLoading}</li> : null}
            {removal.status === 'error' ? <li>{coursesStrings.slot.previewFailed}</li> : null}
          </ul>
        ) : null}
        <FormError>{shownError}</FormError>
      </form>
    </BottomSheet>
  )
}
