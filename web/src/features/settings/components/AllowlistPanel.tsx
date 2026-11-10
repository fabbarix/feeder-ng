import { useState, type FormEvent } from 'react'
import { Button, Checkbox, Chip, ListGroup, ListRow, TextField, useConfirm } from '../../../ui'
import { isEmail, isLastAdmin } from '../lib/allowlist'
import { settingsStrings } from '../strings'
import type { AllowedUser } from '../types'
import '../settings.css'

export interface AllowlistPanelProps {
  users: AllowedUser[]
  currentUserId: number
  error?: string
  /** F-02 stub: the refusal of the Add (409 email_taken), shown under the email field. */
  addError?: string
  /** Resolves when added; the panel clears its field then, and keeps the text if it rejects. */
  onAdd: (email: string) => Promise<unknown>
  onSetAdmin: (id: number, isAdmin: boolean) => void
  onRemove: (id: number) => void
}

const text = settingsStrings.allowlistPanel

/** The email field "Email to allow" with "Add to allowlist"; a ListGroup row per User: the email (meta "(you)"), a chip
 *  "Last Admin" for the only Admin, an Admin checkbox "Admin: <email>" and "Remove <email>", which asks in a danger
 *  ConfirmDialog. The only Admin's controls are locked. */
export function AllowlistPanel({ users, currentUserId, error, onAdd, onSetAdmin, onRemove }: AllowlistPanelProps) {
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
      <form className="settings__row settings__row--wrap-start" onSubmit={submit} noValidate>
        <TextField
          label={text.emailLabel}
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value)
            setBadEmail(false)
          }}
        />
        <Button type="submit" variant="tertiary">
          {text.add}
        </Button>
        {badEmail ? (
          <p role="alert" className="settings__error">
            {text.badEmail}
          </p>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="settings__error">
          {error}
        </p>
      ) : null}
      <ListGroup label={settingsStrings.allowlist}>
        {users.map((u) => {
          const locked = isLastAdmin(users, u)
          return (
            <ListRow
              key={u.id}
              title={u.email}
              meta={u.id === currentUserId ? text.you : undefined}
              trailing={
                <span className="settings__row">
                  <Checkbox label={text.admin(u.email)} checked={u.isAdmin} disabled={locked} onChange={(isAdmin) => onSetAdmin(u.id, isAdmin)} />
                  <Button variant="tertiary" aria-label={text.remove(u.email)} disabled={locked} onClick={() => void askRemove(u)}>
                    {text.removeButton}
                  </Button>
                </span>
              }
            >
              {locked ? <Chip kind="tag">{text.lastAdmin}</Chip> : null}
            </ListRow>
          )
        })}
      </ListGroup>
    </div>
  )
}
