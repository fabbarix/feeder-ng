import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { BottomSheet, Button, ColorSwatches, CROP_ASPECTS, EmojiPicker, ImagePicker, Segmented, Select, StepperField, TextField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { avatarMode, keepOnLeaving, withAvatarMode, type AvatarMode } from '../lib/memberAvatar'
import { availableUsers, canLinkMe, MEMBER_AVATARS, MEMBER_COLOURS, memberDraft, memberFieldErrors, memberFromDraft, type MemberFieldErrors } from '../lib/memberForm'
import { MAX_PORTION_FACTOR, MIN_PORTION_FACTOR, PORTION_STEP } from '../lib/portions'
import { settingsStrings } from '../strings'
import type { AllowedUser, Member, MemberInput } from '../types'
import { MemberAwaySection } from './MemberAwaySection'
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
  /** A server refusal that belongs to no field: the form's one alert (FormError), above the footer. */
  error?: string
  /** A server refusal of the email (422 / 409 email_taken), shown under the Email field. */
  emailError?: string
  /** Called when the Admin edits the Email field, so the page can clear `emailError`. */
  onEmailEdit?: () => void
  onSave: (input: MemberInput, userId: number | null) => void | Promise<void>
  /** Remove Member (editing only). The page asks first (the impact confirm). */
  onDelete?: () => void | Promise<void>
  onClose: () => void
}

const text = settingsStrings.member
const NO_USER = ''

/**
 * A BottomSheet "Add Member" / "Edit Member": Name, Colour (named swatches, Custom), Avatar (Initials, Emoji or Photo), Portion Factor
 * stepper (0.25..3, step 0.25), Email, Linked User Select. B9-36 (SAFE-02, SAFE-04, SHORT-02): the footer is Cancel and Save Member
 * (bound to the form), with Remove Member as an outlined danger button when editing (its own row under a divider on a phone, the far
 * start from 600 px); no Close; a changed sheet asks "Discard changes?" before it goes.
 */
export function MemberEditor({ open, member, users, members, currentUserId, saving, error, emailError, onEmailEdit, onSave, onDelete, onClose }: MemberEditorProps) {
  const formId = useId()
  const [dirty, setDirty] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  // A fresh sheet starts clean (the form below is keyed by the Member, so its own state starts again too).
  useEffect(() => {
    if (!open) setDirty(false)
  }, [open])
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onCancel={onClose}
      confirmDismiss={dirty}
      title={member ? text.editTitle : text.addTitle}
      submit={{ label: text.save, form: formId, loading: saving, disabled: photoBusy }}
      footer={
        member && onDelete ? (
          <div className="member-sheet__remove">
            <Button variant="danger-secondary" disabled={saving} onClick={() => void onDelete()}>
              {text.remove}
            </Button>
          </div>
        ) : undefined
      }
    >
      <MemberForm
        key={member?.id ?? 'new'}
        id={formId}
        member={member}
        users={users}
        members={members}
        currentUserId={currentUserId}
        error={error}
        emailError={emailError}
        onEmailEdit={onEmailEdit}
        onSave={onSave}
        onDirtyChange={setDirty}
        onPhotoBusy={setPhotoBusy}
      />
      {/* B9-46 (SET-16): the Member's Aways, after the fields; an existing Member only. */}
      {member ? <MemberAwaySection member={member} /> : null}
    </BottomSheet>
  )
}

type FormProps = Pick<MemberEditorProps, 'member' | 'users' | 'members' | 'currentUserId' | 'error' | 'emailError' | 'onEmailEdit' | 'onSave'> & {
  id: string
  onDirtyChange: (dirty: boolean) => void
  onPhotoBusy: (busy: boolean) => void
}

function MemberForm({ id, member, users, members, currentUserId, error, emailError, onEmailEdit, onSave, onDirtyChange, onPhotoBusy }: FormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [initial] = useState<MemberInput>(() => memberDraft(member))
  const [draft, setDraft] = useState<MemberInput>(initial)
  const [userId, setUserId] = useState<number | null>(member?.userId ?? null)
  const [errors, setErrors] = useState<MemberFieldErrors>({})
  const [submitCount, setSubmitCount] = useState(0)
  const [mode, setMode] = useState<AvatarMode>(() => avatarMode(memberDraft(member)))
  const [kept, setKept] = useState<Pick<MemberInput, 'avatar' | 'photo'>>({ avatar: '', photo: '' })
  const set = (patch: Partial<MemberInput>) => setDraft((d) => ({ ...d, ...patch }))
  const offered = availableUsers(users, members, member)
  const fieldErrors = { ...errors, email: errors.email ?? emailError }
  useFocusFirstInvalid(formRef, fieldErrors, submitCount)

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || userId !== (member?.userId ?? null)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = memberFieldErrors(draft)
    setErrors(found)
    setSubmitCount((n) => n + 1)
    if (!found.name && !found.portionFactor && !found.email) void onSave(memberFromDraft(draft), userId)
  }

  return (
    <form ref={formRef} id={id} className="settings__stack member-sheet__form" onSubmit={submit} noValidate>
      <TextField
        label={text.name}
        value={draft.name}
        error={errors.name}
        onChange={(name) => {
          set({ name })
          setErrors((e) => ({ ...e, name: undefined }))
        }}
      />
      <ColorSwatches label={text.colour} swatches={[...MEMBER_COLOURS]} value={draft.colour} onChange={(colour) => set({ colour })} allowCustom />
      <Segmented
        label={text.avatar}
        helper={text.avatarHelper}
        options={[
          { value: 'initials', label: text.avatarInitials },
          { value: 'emoji', label: text.avatarEmoji },
          { value: 'photo', label: text.avatarPhoto },
        ]}
        value={mode}
        onChange={(next) => {
          const stash = keepOnLeaving(kept, draft, mode)
          setKept(stash)
          setMode(next)
          setDraft((d) => withAvatarMode(d, next, stash))
        }}
      />
      {mode === 'emoji' ? (
        <EmojiPicker label={text.avatarEmoji} options={[...MEMBER_AVATARS]} value={draft.avatar} onChange={(avatar) => set({ avatar })} />
      ) : null}
      {mode === 'photo' ? (
        <ImagePicker
          label={text.photoLabel}
          helper={text.photoHelper}
          size={72}
          aspect={CROP_ASPECTS.square}
          listenOn="dialog"
          value={draft.photo ?? ''}
          onChange={(photo) => set({ photo })}
          onBusyChange={onPhotoBusy}
        />
      ) : null}
      <StepperField
        label={text.portionFactorLabel}
        helper={text.portionFactorHelper}
        value={draft.portionFactor}
        min={MIN_PORTION_FACTOR}
        max={MAX_PORTION_FACTOR}
        step={PORTION_STEP}
        error={errors.portionFactor}
        onChange={(portionFactor) => {
          set({ portionFactor })
          setErrors((e) => ({ ...e, portionFactor: undefined }))
        }}
      />
      <TextField
        label={text.email}
        type="email"
        helper={text.emailHelper}
        error={fieldErrors.email}
        value={draft.email ?? ''}
        onChange={(email) => {
          set({ email })
          setErrors((e) => ({ ...e, email: undefined }))
          onEmailEdit?.()
        }}
      />
      <Select
        label={text.linkedUser}
        options={[{ value: NO_USER, label: text.noLinkedUser }, ...offered.map((u) => ({ value: String(u.id), label: u.id === currentUserId ? text.you(u.displayName) : u.displayName }))]}
        value={userId === null ? NO_USER : String(userId)}
        onChange={(v) => setUserId(v === NO_USER ? null : Number(v))}
      />
      {canLinkMe(members, member, userId, currentUserId) ? (
        <Button variant="secondary" onClick={() => setUserId(currentUserId ?? null)}>
          {text.thisIsMe}
        </Button>
      ) : null}
      <FormError>{error}</FormError>
    </form>
  )
}
