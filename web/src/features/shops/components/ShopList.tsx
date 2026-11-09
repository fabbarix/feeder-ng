import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomSheet, Button, EmptyState, Tile } from '../../../ui'
import { FormField } from '../../products/components/FormField'
import { errorText } from '../../products/lib/productForm'
import { strings } from '../strings'
import type { Shop } from '../types'
import '../../products/products.css'

export interface ShopListProps {
  shops: Shop[]
  isAdmin: boolean
  onAdd: (name: string) => Promise<void>
}

/** Tiles per Shop linking to /settings/shops/:id; EmptyState when none; an Admin also gets "Add Shop" (BottomSheet with a name field), a non-Admin sees strings.adminOnly instead. */
export function ShopList({ shops, isAdmin, onAdd }: ShopListProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pg__stack">
      {shops.length === 0 ? (
        <EmptyState title={strings.shopsEmpty} />
      ) : (
        <ul className="pg__list">
          {shops.map((s) => (
            <li key={s.id}>
              <Tile size="wide">
                <Link to={`/settings/shops/${s.id}`}>{s.name}</Link>
              </Tile>
            </li>
          ))}
        </ul>
      )}
      {isAdmin ? (
        <Button onClick={() => setOpen(true)}>{strings.addShop}</Button>
      ) : (
        <p className="pg__muted">{strings.adminOnly}</p>
      )}
      <BottomSheet open={open} onClose={() => setOpen(false)} title={strings.addShop}>
        {open ? <ShopNameForm submitLabel={strings.saveShop} initial="" onSubmit={async (name) => { await onAdd(name); setOpen(false) }} /> : null}
      </BottomSheet>
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
      <FormField label={strings.shopNameLabel}>
        {(c) => <input {...c} type="text" value={name} onChange={(e) => setName(e.target.value)} />}
      </FormField>
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
