import { useState } from 'react'
import { Button, EmptyState, ListGroup, ListRow, TextField } from '../../../ui'
import { AddShopSheet } from './AddShopSheet'
import { errorText } from '../../products/lib/productForm'
import { strings } from '../strings'
import type { Shop } from '../types'
import '../../products/products.css'

export interface ShopListProps {
  shops: Shop[]
}

/** A ListGroup of Shops, each row linking to /settings/shops/:id (a pin icon when its Shop Location is saved); EmptyState when none; "Add Shop" for every User (AddShopSheet). */
export function ShopList({ shops }: ShopListProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pg__stack">
      {shops.length === 0 ? (
        <EmptyState title={strings.shopsEmpty} />
      ) : (
        <ListGroup label={strings.shopsTitle}>
          {shops.map((s) => (
            <ListRow key={s.id} title={s.name} chevron href={`/settings/shops/${s.id}`} metaIcon={s.location ? 'location' : undefined} meta={s.location ? strings.locationTitle : undefined} />
          ))}
        </ListGroup>
      )}
      <Button variant="tertiary" onClick={() => setOpen(true)}>
        {strings.addShop}
      </Button>
      <AddShopSheet open={open} onClose={() => setOpen(false)} onAdded={() => setOpen(false)} />
    </div>
  )
}

export interface ShopNameFormProps {
  initial: string
  submitLabel: string
  onSubmit: (name: string) => Promise<void>
}

/** A single Shop name field with a submit button; a rejection's message is shown in an alert. */
export function ShopNameForm({ initial, submitLabel, onSubmit }: ShopNameFormProps) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="pg__stack"
      onSubmit={(e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)
        onSubmit(name.trim())
          .catch((err) => setError(errorText(err)))
          .finally(() => setSaving(false))
      }}
    >
      <TextField label={strings.shopNameLabel} value={name} onChange={setName} />
      {error ? (
        <p role="alert" className="pg__error">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={name.trim() === ''} loading={saving}>
        {submitLabel}
      </Button>
    </form>
  )
}
