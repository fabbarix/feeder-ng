import { useState, type FormEvent } from 'react'
import { Button, Chip } from '../../../ui'
import { isEmail, isLastAdmin } from '../lib/allowlist'
import { settingsStrings } from '../strings'
import type { AllowedUser } from '../types'
import { Field } from './Field'
import '../settings.css'

export interface AllowlistPanelProps {
  users: AllowedUser[]
  currentUserId: number
  error?: string
  /** Resolves when added; the panel clears its field then, and keeps the text if it rejects. */
  onAdd: (email: string) => Promise<unknown>
  onSetAdmin: (id: number, isAdmin: boolean) => void
  onRemove: (id: number) => void
}

const text = settingsStrings.allowlistPanel

/** Field "Email to allow" + "Add to allowlist"; a row per User with checkbox "Admin: <email>" and a two-step
 *  "Remove <email>" -> "Confirm remove <email>". The only Admin's row is locked ("Last Admin"). */
export function AllowlistPanel({ users, currentUserId, error, onAdd, onSetAdmin, onRemove }: AllowlistPanelProps) {
  const [email, setEmail] = useState('')
  const [badEmail, setBadEmail] = useState(false)
  const [confirming, setConfirming] = useState<number | null>(null)

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

  return (
    <div className="settings__stack">
      <form className="settings__row settings__row--wrap-start" onSubmit={submit} noValidate>
        <Field label={text.emailLabel} error={badEmail ? text.badEmail : undefined}>
          {(c) => <input {...c} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Button type="submit">{text.add}</Button>
      </form>
      {error ? (
        <p role="alert" className="settings__error">
          {error}
        </p>
      ) : null}
      <ul className="settings__list">
        {users.map((u) => {
          const locked = isLastAdmin(users, u)
          return (
            <li key={u.id} className="settings__row settings__row--between">
              <div className="settings__row">
                <span>{u.email}</span>
                {u.id === currentUserId ? <span className="settings__muted">{text.you}</span> : null}
                {locked ? <Chip tone="accent">{text.lastAdmin}</Chip> : null}
              </div>
              <div className="settings__row">
                <label className="choice">
                  <input
                    type="checkbox"
                    aria-label={text.admin(u.email)}
                    checked={u.isAdmin}
                    disabled={locked}
                    onChange={(e) => onSetAdmin(u.id, e.target.checked)}
                  />
                  Admin
                </label>
                {confirming === u.id ? (
                  <>
                    <Button
                      aria-label={text.confirmRemove(u.email)}
                      onClick={() => {
                        setConfirming(null)
                        onRemove(u.id)
                      }}
                    >
                      Confirm
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(null)}>
                      {text.cancel}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" aria-label={text.remove(u.email)} disabled={locked} onClick={() => setConfirming(u.id)}>
                    Remove
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
