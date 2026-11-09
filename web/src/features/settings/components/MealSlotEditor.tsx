import { useState, type FormEvent } from 'react'
import { BottomSheet, Button } from '../../../ui'
import { slotDraft, slotFromDraft, slotProblem } from '../lib/slotForm'
import { WEEKDAYS } from '../lib/weekdays'
import { settingsStrings } from '../strings'
import type { MealSlot, MealSlotInput, Member } from '../types'
import { AttendanceEditor } from './AttendanceEditor'
import { Field } from './Field'
import '../settings.css'

export interface MealSlotEditorProps {
  open: boolean
  slot?: MealSlot
  members: Member[]
  saving?: boolean
  error?: string
  onSave: (input: MealSlotInput) => void | Promise<void>
  onDelete?: () => void | Promise<void>
  onClose: () => void
}

const text = settingsStrings.slot

/** A BottomSheet "Add Meal Slot" / "Edit Meal Slot": Weekday select, Name, Usual time, AttendanceEditor;
 *  buttons "Save Meal Slot" and "Remove Meal Slot" (editing only). */
export function MealSlotEditor({ open, slot, members, saving, error, onSave, onDelete, onClose }: MealSlotEditorProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={slot ? text.editTitle : text.addTitle}>
      <SlotForm key={slot?.id ?? 'new'} slot={slot} members={members} saving={saving} error={error} onSave={onSave} onDelete={onDelete} />
    </BottomSheet>
  )
}

type FormProps = Pick<MealSlotEditorProps, 'slot' | 'members' | 'saving' | 'error' | 'onSave' | 'onDelete'>

function SlotForm({ slot, members, saving, error, onSave, onDelete }: FormProps) {
  const [draft, setDraft] = useState<MealSlotInput>(() => slotDraft(slot))
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<MealSlotInput>) => setDraft((d) => ({ ...d, ...patch }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = slotProblem(draft)
    setProblem(found)
    if (!found) void onSave(slotFromDraft(draft))
  }

  return (
    <form className="settings__stack" onSubmit={submit} noValidate>
      <Field label={text.weekday}>
        {(c) => (
          <select {...c} value={draft.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
            {WEEKDAYS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={text.name} error={problem ?? undefined}>
        {(c) => <input {...c} type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} />}
      </Field>
      <Field label={text.time}>{(c) => <input {...c} type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />}</Field>
      <AttendanceEditor members={members} value={draft.attendance} onChange={(attendance) => set({ attendance })} />
      {error ? (
        <p role="alert" className="settings__error">
          {error}
        </p>
      ) : null}
      <div className="settings__row">
        <Button type="submit" loading={saving}>
          {text.save}
        </Button>
        {slot && onDelete ? (
          <Button variant="ghost" disabled={saving} onClick={() => void onDelete()}>
            {text.remove}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
