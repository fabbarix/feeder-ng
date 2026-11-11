import { useEffect, useState, type FormEvent } from 'react'
import { BottomSheet, Button, Chip, FieldRow, FormActions, TimeField, TextField } from '../../../ui'
import { WeekdayPicker } from '../../../ui/WeekdayPicker/WeekdayPicker'
import { sortIsoDays } from '../../../ui/WeekdayPicker/weekdays'
import { documentLocale } from '../lib/locale'
import { batchRequest, hasChanges, matchingSlots, quickPicks, sameDays, summaryLines } from '../lib/multiDay'
import { slotDraft, slotFromDraft, slotInputsForWeekdays, slotProblem, weekdaysProblem } from '../lib/slotForm'
import { settingsStrings } from '../strings'
import type { MealSlot, MealSlotInput, Member, SlotBatchRequest } from '../types'
import { AttendanceEditor } from './AttendanceEditor'
import '../settings.css'

export interface MealSlotEditorProps {
  open: boolean
  slot?: MealSlot
  members: Member[]
  /** Add mode starts with these weekdays chosen (ISO 1..7), e.g. the weekday whose add button was pressed. */
  defaultWeekdays?: number[]
  saving?: boolean
  error?: string
  /** Adding: one body per chosen weekday. */
  onSave: (inputs: MealSlotInput[]) => void | Promise<void>
  /** R15, editing: every Meal Slot in the household (to match by name) and the one-call batch save. */
  slots?: MealSlot[]
  onApply?: (request: SlotBatchRequest) => void | Promise<void>
  weekStart?: 1 | 6 | 7
  locale?: string
  onDelete?: () => void | Promise<void>
  /** Editing only: opens the one-date Attendance for this slot ("Change a date"). */
  onChangeDate?: () => void
  onClose: () => void
}

const text = settingsStrings.slot

/** A BottomSheet "Add Meal Slot" / "Edit Meal Slot". Adding: "Days" chips; editing: "Apply to" chips (the same name on the
 *  other days gets the same change, one save), quick picks, Name, Usual time, AttendanceEditor and a "What will change" summary. */
export function MealSlotEditor({ open, slot, onClose, ...rest }: MealSlotEditorProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={slot ? text.editTitle : text.addTitle}>
      <SlotForm key={slot?.id ?? 'new'} slot={slot} {...rest} />
    </BottomSheet>
  )
}

type FormProps = Omit<MealSlotEditorProps, 'open' | 'onClose'>

function SlotForm({ slot, members, defaultWeekdays, saving, error, onSave, slots, onApply, weekStart, locale = documentLocale(), onDelete, onChangeDate }: FormProps) {
  const [draft, setDraft] = useState<MealSlotInput>(() => slotDraft(slot, members))
  const [weekdays, setWeekdays] = useState<number[]>(() => (slot ? [slot.weekday] : (defaultWeekdays ?? [])))
  // A partial save hands back the weekdays still to save: the selection follows them, the draft stays as typed.
  const weekdaysKey = (defaultWeekdays ?? []).join(',')
  useEffect(() => {
    if (!slot) setWeekdays(weekdaysKey === '' ? [] : weekdaysKey.split(',').map(Number))
  }, [weekdaysKey, slot])
  const [problem, setProblem] = useState<{ message: string; field: 'weekdays' | 'form' } | null>(null)
  const set = (patch: Partial<MealSlotInput>) => setDraft((d) => ({ ...d, ...patch }))
  const picks = quickPicks(slots ?? (slot ? [slot] : []), slot)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const none = weekdaysProblem(weekdays)
    if (none) return setProblem({ message: none, field: 'weekdays' })
    const bad = slotProblem(draft)
    if (bad) return setProblem({ message: bad, field: 'form' })
    if (!slot) {
      setProblem(null)
      void onSave(slotInputsForWeekdays(draft, weekdays))
      return
    }
    if (!onApply) {
      void onSave([slotFromDraft({ ...draft, weekday: slot.weekday })])
      return
    }
    const request = batchRequest(slot, weekdays, draft)
    if (!hasChanges(request.set)) return setProblem({ message: text.nothingToChange, field: 'form' })
    setProblem(null)
    void onApply(request)
  }

  const match = slot ? matchingSlots(slots ?? [slot], slot.name, weekdays) : null
  const summary = slot && match ? summaryLines(slot.name.trim(), match.matched, match.skipped, locale) : null
  const formProblem = problem?.field === 'form' ? problem.message : undefined
  const shownError = formProblem ?? error

  return (
    <form className="settings__stack" onSubmit={submit} noValidate>
      <WeekdayPicker
        label={slot ? text.applyTo : text.days}
        value={weekdays}
        onChange={(days) => setWeekdays(sortIsoDays(days))}
        weekStart={weekStart}
        locale={locale}
        error={problem?.field === 'weekdays' ? problem.message : undefined}
      />
      <div className="meal-slot-quickpicks">
        {picks.map((pick) => (
          <Chip key={pick.id} kind="filter" selected={sameDays(weekdays, pick.days)} onClick={() => setWeekdays(pick.days)}>
            {pick.label}
          </Chip>
        ))}
      </div>
      <FieldRow>
        <TextField label={text.name} value={draft.name} onChange={(name) => set({ name })} />
        <TimeField label={text.time} value={draft.time} onChange={(time) => set({ time })} />
      </FieldRow>
      <AttendanceEditor members={members} value={draft.attendance} onChange={(attendance) => set({ attendance })} />
      {summary ? (
        <ul className="meal-slot-summary" role="list" aria-label={text.willChange} aria-live="polite">
          {summary.update ? <li>{summary.update}</li> : null}
          {summary.skipped.map((line) => (
            <li key={line} className="meal-slot-summary__skipped">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {shownError ? (
        <p role="alert" className="settings__error">
          {shownError}
        </p>
      ) : null}
      <FormActions
        primary={
          <Button type="submit" loading={saving}>
            {text.save}
          </Button>
        }
        tertiary={
          slot && onChangeDate ? (
            <Button variant="tertiary" onClick={onChangeDate}>
              {text.changeDateButton}
            </Button>
          ) : undefined
        }
        destructive={
          slot && onDelete ? (
            <Button variant="danger-tertiary" disabled={saving} onClick={() => void onDelete()}>
              {text.remove}
            </Button>
          ) : undefined
        }
      />
    </form>
  )
}
