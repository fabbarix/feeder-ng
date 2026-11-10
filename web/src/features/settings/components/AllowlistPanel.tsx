import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, IconButton, ListGroup, ListRow, Switch, TextField, useConfirm } from '../../../ui'
import { isEmail, isLastAdmin } from '../lib/allowlist'
import { settingsStrings } from '../strings'
import type { AllowedUser } from '../types'
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
 *  row per User: the email, meta "You" / "Last Admin", an Admin Switch and an icon-only "Remove <email>", which asks in a
 *  danger ConfirmDialog. The only Admin's controls are locked. */
export function AllowlistPanel({ users, currentUserId, error, addError, onEmailEdit, onAdd, onSetAdmin, onRemove }: AllowlistPanelProps) {
  const [email, setEmail] = useState('')
  const [badEmail, setBadEmail] = useState(false)
  const dialogs = useConfirm()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const valid = isEmail(email)
    setBadEmail(!valid)
    if (!valid) return
    onAdd(email.trim()).then(
      () => setEmail(''),
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
            error={badEmail ? text.badEmail : addError}
            value={email}
            onChange={(value) => {
              setEmail(value)
              setBadEmail(false)
              onEmailEdit?.()
            }}
          />
        </div>
        <Button type="submit" variant="tertiary" className="allowlist__button">
          {text.add}
        </Button>
      </form>
      <p className="settings__muted">
        {text.askToJoinHint} <Link to="/settings/access-requests">{text.signInRequests}</Link>.
      </p>
      {error ? (
        <p role="alert" className="settings__error">
          {error}
        </p>
      ) : null}
      <ListGroup label={settingsStrings.allowlist}>
        {users.map((u) => {
          const locked = isLastAdmin(users, u)
          const you = u.id === currentUserId
          const meta = [you ? text.youMeta : null, locked ? text.lastAdmin : null].filter(Boolean).join(' · ')
          return (
            <ListRow
              key={u.id}
              title={u.email}
              meta={meta || undefined}
              trailing={
                <span className="allowlist__actions">
                  <Switch label={text.adminLabel} aria-label={text.admin(u.email)} checked={u.isAdmin} disabled={locked} onChange={(isAdmin) => onSetAdmin(u.id, isAdmin)} />
                  <IconButton icon="delete" label={text.remove(u.email)} disabled={locked} onClick={() => void askRemove(u)} />
                </span>
              }
            />
          )
        })}
      </ListGroup>
    </div>
  )
}
