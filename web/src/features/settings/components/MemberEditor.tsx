import { useState, type FormEvent } from 'react'
import { BottomSheet, Button, Stepper } from '../../../ui'
import { memberDraft, memberFromDraft, memberProblem } from '../lib/memberForm'
import { MAX_PORTION_FACTOR, MIN_PORTION_FACTOR, PORTION_STEP } from '../lib/portions'
import { settingsStrings } from '../strings'
import type { AllowedUser, Member, MemberInput } from '../types'
import { Field } from './Field'
import '../settings.css'

export interface MemberEditorProps {
  open: boolean
  /** Absent = adding a new Member. */
  member?: Member
  users: Pick<AllowedUser, 'id' | 'displayName' | 'email'>[]
  saving?: boolean
  error?: string
  onSave: (input: MemberInput, userId: number | null) => void | Promise<void>
  onDelete?: () => void | Promise<void>
  onClose: () => void
}

const text = settingsStrings.member

/** A BottomSheet "Add Member" / "Edit Member": Name, Colour, Avatar (optional), Portion Factor stepper
 *  (0.25..3, step 0.25), Linked User select; buttons "Save Member" and "Remove Member" (editing only). */
export function MemberEditor({ open, member, users, saving, error, onSave, onDelete, onClose }: MemberEditorProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={member ? text.editTitle : text.addTitle}>
      <MemberForm key={member?.id ?? 'new'} member={member} users={users} saving={saving} error={error} onSave={onSave} onDelete={onDelete} />
    </BottomSheet>
  )
}

type FormProps = Pick<MemberEditorProps, 'member' | 'users' | 'saving' | 'error' | 'onSave' | 'onDelete'>

function MemberForm({ member, users, saving, error, onSave, onDelete }: FormProps) {
  const [draft, setDraft] = useState<MemberInput>(() => memberDraft(member))
  const [userId, setUserId] = useState<number | null>(member?.userId ?? null)
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<MemberInput>) => setDraft((d) => ({ ...d, ...patch }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = memberProblem(draft)
    setProblem(found)
    if (!found) void onSave(memberFromDraft(draft), userId)
  }

  return (
    <form className="settings__stack" onSubmit={submit} noValidate>
      <Field label={text.name} error={problem ?? undefined}>
        {(c) => <input {...c} type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} />}
      </Field>
      <Field label={text.colour}>{(c) => <input {...c} type="color" value={draft.colour} onChange={(e) => set({ colour: e.target.value })} />}</Field>
      <Field label={text.avatar}>{(c) => <input {...c} type="text" value={draft.avatar} onChange={(e) => set({ avatar: e.target.value })} />}</Field>
      <div className="settings__stack">
        <span className="field__label">{text.portionFactorLabel}</span>
        <Stepper
          label={text.portionFactorLabel}
          value={draft.portionFactor}
          min={MIN_PORTION_FACTOR}
          max={MAX_PORTION_FACTOR}
          step={PORTION_STEP}
          onChange={(portionFactor) => set({ portionFactor })}
        />
      </div>
      <Field label={text.linkedUser}>
        {(c) => (
          <select {...c} value={userId ?? ''} onChange={(e) => setUserId(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">{text.noLinkedUser}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        )}
      </Field>
      {error ? (
        <p role="alert" className="settings__error">
          {error}
        </p>
      ) : null}
      <div className="settings__row">
        <Button type="submit" loading={saving}>
          {text.save}
        </Button>
        {member && onDelete ? (
          <Button variant="ghost" disabled={saving} onClick={() => void onDelete()}>
            {text.remove}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
