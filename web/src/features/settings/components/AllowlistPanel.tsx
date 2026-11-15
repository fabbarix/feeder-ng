import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, IconButton, ListGroup, ListRow, Muted, Switch, TextField, useConfirm } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useSignInMessage } from '../hooks/useSignInMessage'
import { EmailText, NameText } from '../../access'
import { allowlistMeta, isEmail, isLastAdmin } from '../lib/allowlist'
import { settingsStrings } from '../strings'
import type { AllowedUser } from '../types'
import { RowSignInActions } from './RowSignInActions'
import { SignInMessageSheet } from './SignInMessageSheet'
import '../settings.css'

export interface AllowlistPanelProps {
  users: AllowedUser[]
  currentUserId: number
  error?: string
  /** The refusal of the Add (409 email_taken), shown under the email field; the page clears it when the text changes. */
  addError?: string
  /** Called when the Admin edits the email field, so the page can clear `addError`. */
  onEmailEdit?: () => void
  /** Resolves when added; the panel clears its field then, and keeps the text if it rejects. */
  onAdd: (email: string) => Promise<unknown>
  onSetAdmin: (id: number, isAdmin: boolean) => void
  onRemove: (id: number) => void
}

const text = settingsStrings.allowlistPanel

/** The add form (email field "Email to allow" and "Add to allowlist"), a hint linking to Sign-in requests, and a ListGroup
 *  row per User: the email, the meta (allowlistMeta: "You · Admin · Last Admin" on your row, the display name or "Not signed in
 *  yet" on the others), and in the row's actions slot an Admin Switch and two icon buttons:
 *  Share and More (Copy sign-in message, Remove) where the device has a share sheet, else Copy and Remove. Your own row has
 *  Remove only. Remove asks in a danger ConfirmDialog. The only Admin's controls are locked. After an Add, a toast offers the
 *  sign-in message (SET-03). */
export function AllowlistPanel({ users, currentUserId, error, addError, onEmailEdit, onAdd, onSetAdmin, onRemove }: AllowlistPanelProps) {
  const [email, setEmail] = useState('')
  const [badEmail, setBadEmail] = useState(false)
  const dialogs = useConfirm()
  const signIn = useSignInMessage()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const valid = isEmail(email)
    setBadEmail(!valid)
    if (!valid) return
    const added = email.trim()
    onAdd(added).then(
      () => {
        setEmail('')
        signIn.announceAdded(added)
      },
      () => {},
    )
  }

  const askRemove = async (u: AllowedUser) => {
    const yes = await dialogs.confirm({ title: text.confirmRemoveTitle(u.email), body: text.confirmRemoveBody, confirmLabel: text.removeButton, tone: 'danger' })
    if (yes) onRemove(u.id)
  }

  return (
    <div className="settings__stack">
      <form className="allowlist__add" onSubmit={submit} noValidate>
        <div className="allowlist__field">
          <TextField
            label={text.emailLabel}
            type="email"
            error={badEmail ? settingsStrings.invalidEmail : addError}
            value={email}
            onChange={(value) => {
              setEmail(value)
              setBadEmail(false)
              onEmailEdit?.()
            }}
          />
        </div>
        <Button type="submit" variant="secondary" className="allowlist__button">
          {text.add}
        </Button>
      </form>
      <Muted>
        {text.askToJoinHint} <Link to="/settings/access-requests">{text.signInRequests}</Link>.
      </Muted>
      <FormError>{error}</FormError>
      <div className="allowlist__list">
        <ListGroup label={settingsStrings.allowlist}>
          {users.map((u) => {
            const locked = isLastAdmin(users, u)
            const you = u.id === currentUserId
            const meta = allowlistMeta(u, { you, locked })
            return (
              <ListRow
                key={u.id}
                title={<EmailText email={u.email} />}
                wrapTitle
                meta={meta ? <NameText name={meta} /> : undefined}
                actions={
                  <span className="allowlist__actions">
                    <Switch label={text.adminLabel} aria-label={text.admin(u.email)} checked={u.isAdmin} disabled={locked} onChange={(isAdmin) => onSetAdmin(u.id, isAdmin)} />
                    {you ? (
                      <span className="allowlist__icons">
                        <IconButton icon="delete" label={text.remove(u.email)} title={text.remove(u.email)} disabled={locked} onClick={() => void askRemove(u)} />
                      </span>
                    ) : (
                      <RowSignInActions
                        email={u.email}
                        canShare={signIn.canShare}
                        onShare={(starter) => void signIn.shareFor(u.email, starter)}
                        onCopy={(starter) => void signIn.copyFor(u.email, starter)}
                        onRemove={() => void askRemove(u)}
                      />
                    )}
                  </span>
                }
              />
            )
          })}
        </ListGroup>
      </div>
      <SignInMessageSheet message={signIn.fallback?.message ?? null} onClose={signIn.closeFallback} />
    </div>
  )
}
