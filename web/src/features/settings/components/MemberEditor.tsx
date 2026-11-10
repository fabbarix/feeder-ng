import { useState, type FormEvent } from 'react'
import { BottomSheet, Button, ColorSwatches, EmojiPicker, Select, StepperField, TextField } from '../../../ui'
import { availableUsers, canLinkMe, MEMBER_AVATARS, MEMBER_COLOURS, memberDraft, memberFromDraft, memberProblem } from '../lib/memberForm'
import { MAX_PORTION_FACTOR, MIN_PORTION_FACTOR, PORTION_STEP } from '../lib/portions'
import { settingsStrings } from '../strings'
import type { AllowedUser, Member, MemberInput } from '../types'
import '../settings.css'

export interface MemberEditorProps {
  open: boolean
  /** Absent = adding a new Member. */
  member?: Member
  users: Pick<AllowedUser, 'id' | 'displayName' | 'email'>[]
  /** WP11: every Member, so Users already linked to another Member are not offered (availableUsers). */
  members: Pick<Member, 'id' | 'userId'>[]
  /** R11a: the signed-in User's id. Their entry in Linked User reads "<name> (you)" and a "This is me" button links them. */
  currentUserId?: number
  saving?: boolean
  error?: string
  onSave: (input: MemberInput, userId: number | null) => void | Promise<void>
  onDelete?: () => void | Promise<void>
  onClose: () => void
}

const text = settingsStrings.member
const NO_USER = ''

/** A BottomSheet "Add Member" / "Edit Member": Name, Colour (named swatches, Custom), Avatar (emoji, optional), Portion Factor
 *  stepper (0.25..3, step 0.25), Linked User Select; buttons "Save Member" and "Remove Member" (editing only). */
export function MemberEditor({ open, member, users, members, currentUserId, saving, error, onSave, onDelete, onClose }: MemberEditorProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={member ? text.editTitle : text.addTitle}>
      <MemberForm
        key={member?.id ?? 'new'}
        member={member}
        users={users}
        members={members}
        currentUserId={currentUserId}
        saving={saving}
        error={error}
        onSave={onSave}
        onDelete={onDelete}
      />
    </BottomSheet>
  )
}

type FormProps = Pick<MemberEditorProps, 'member' | 'users' | 'members' | 'currentUserId' | 'saving' | 'error' | 'onSave' | 'onDelete'>

function MemberForm({ member, users, members, currentUserId, saving, error, onSave, onDelete }: FormProps) {
  const [draft, setDraft] = useState<MemberInput>(() => memberDraft(member))
  const [userId, setUserId] = useState<number | null>(member?.userId ?? null)
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<MemberInput>) => setDraft((d) => ({ ...d, ...patch }))
  const offered = availableUsers(users, members, member)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = memberProblem(draft)
    setProblem(found)
    if (!found) void onSave(memberFromDraft(draft), userId)
  }

  return (
    <form className="settings__stack" onSubmit={submit} noValidate>
      <TextField label={text.name} value={draft.name} onChange={(name) => set({ name })} />
      <ColorSwatches label={text.colour} swatches={[...MEMBER_COLOURS]} value={draft.colour} onChange={(colour) => set({ colour })} allowCustom />
      <EmojiPicker
        label={text.avatar}
        helper={text.avatarHelper}
        noneLabel={text.avatarNone}
        options={[...MEMBER_AVATARS]}
        value={draft.avatar}
        onChange={(avatar) => set({ avatar })}
      />
      <StepperField
        label={text.portionFactorLabel}
        helper={text.portionFactorHelper}
        value={draft.portionFactor}
        min={MIN_PORTION_FACTOR}
        max={MAX_PORTION_FACTOR}
        step={PORTION_STEP}
        onChange={(portionFactor) => set({ portionFactor })}
      />
      <Select
        label={text.linkedUser}
        options={[{ value: NO_USER, label: text.noLinkedUser }, ...offered.map((u) => ({ value: String(u.id), label: u.id === currentUserId ? text.you(u.displayName) : u.displayName }))]}
        value={userId === null ? NO_USER : String(userId)}
        onChange={(v) => setUserId(v === NO_USER ? null : Number(v))}
      />
      {canLinkMe(members, member, userId, currentUserId) ? (
        <Button variant="tertiary" onClick={() => setUserId(currentUserId ?? null)}>
          {text.thisIsMe}
        </Button>
      ) : null}
      {problem ?? error ? (
        <p role="alert" className="settings__error">
          {problem ?? error}
        </p>
      ) : null}
      <div className="settings__row">
        <Button type="submit" loading={saving}>
          {text.save}
        </Button>
        {member && onDelete ? (
          <Button variant="danger-tertiary" disabled={saving} onClick={() => void onDelete()}>
            {text.remove}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
