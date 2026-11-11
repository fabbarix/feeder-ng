import { useEffect, useState, type FormEvent } from 'react'
import { BottomSheet, Button, MultiSelect, Select, TimeField, TextField } from '../../../ui'
import type { SlotBatchRequest } from '../types'
import { slotDraft, slotFromDraft, slotInputsForWeekdays, slotProblem, weekdaysProblem } from '../lib/slotForm'
import { WEEKDAYS } from '../lib/weekdays'
import { settingsStrings } from '../strings'
import type { MealSlot, MealSlotInput, Member } from '../types'
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
  /** Add mode may cover several weekdays, so this always receives an array (one body per weekday; editing gives one). */
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
const WEEKDAY_OPTIONS = WEEKDAYS.map((d) => ({ value: d.id, label: d.name }))

/** A BottomSheet "Add Meal Slot" / "Edit Meal Slot": Weekdays (several when adding) or one Weekday (editing), Name,
 *  Usual time (TimeField), AttendanceEditor; buttons "Save Meal Slot", "Change a date" and "Remove Meal Slot" (editing). */
export function MealSlotEditor({ open, slot, members, defaultWeekdays, saving, error, onSave, onDelete, onChangeDate, onClose }: MealSlotEditorProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={slot ? text.editTitle : text.addTitle}>
      <SlotForm
        key={slot?.id ?? 'new'}
        slot={slot}
        members={members}
        defaultWeekdays={defaultWeekdays}
        saving={saving}
        error={error}
        onSave={onSave}
        onDelete={onDelete}
        onChangeDate={onChangeDate}
      />
    </BottomSheet>
  )
}

type FormProps = Pick<MealSlotEditorProps, 'slot' | 'members' | 'defaultWeekdays' | 'saving' | 'error' | 'onSave' | 'onDelete' | 'onChangeDate'>

function SlotForm({ slot, members, defaultWeekdays, saving, error, onSave, onDelete, onChangeDate }: FormProps) {
  const [draft, setDraft] = useState<MealSlotInput>(() => slotDraft(slot, members))
  const [weekdays, setWeekdays] = useState<number[]>(() => (slot ? [slot.weekday] : (defaultWeekdays ?? [])))
  // A partial save hands back the weekdays still to save: the selection follows them, the draft stays as typed.
  const weekdaysKey = (defaultWeekdays ?? []).join(',')
  useEffect(() => {
    if (!slot) setWeekdays(weekdaysKey === '' ? [] : weekdaysKey.split(',').map(Number))
  }, [weekdaysKey, slot])
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<MealSlotInput>) => setDraft((d) => ({ ...d, ...patch }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = slot ? slotProblem(draft) : (weekdaysProblem(weekdays) ?? slotProblem(draft))
    setProblem(found)
    if (found) return
    void onSave(slot ? [slotFromDraft({ ...draft, weekday: weekdays[0]! })] : slotInputsForWeekdays(draft, weekdays))
  }

  return (
    <form className="settings__stack" onSubmit={submit} noValidate>
      {slot ? (
        <Select<number> label={text.weekday} options={WEEKDAY_OPTIONS} value={weekdays[0] ?? null} onChange={(day) => setWeekdays([day])} />
      ) : (
        <MultiSelect<number>
          label={text.weekdays}
          options={WEEKDAY_OPTIONS}
          values={weekdays}
          onChange={(days) => setWeekdays([...days].sort((a, b) => a - b))}
        />
      )}
      <TextField label={text.name} value={draft.name} onChange={(name) => set({ name })} />
      <TimeField label={text.time} value={draft.time} onChange={(time) => set({ time })} />
      <AttendanceEditor members={members} value={draft.attendance} onChange={(attendance) => set({ attendance })} />
      {problem ?? error ? (
        <p role="alert" className="settings__error">
          {problem ?? error}
        </p>
      ) : null}
      <div className="settings__row">
        <Button type="submit" loading={saving}>
          {text.save}
        </Button>
        {slot && onChangeDate ? (
          <Button variant="tertiary" onClick={onChangeDate}>
            {text.changeDateButton}
          </Button>
        ) : null}
        {slot && onDelete ? (
          <Button variant="danger-tertiary" disabled={saving} onClick={() => void onDelete()}>
            {text.remove}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
