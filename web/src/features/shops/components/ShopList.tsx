import { useState } from 'react'
import { Button, EmptyState, ListGroup, ListRow, Stack, TextField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { AddShopSheet } from './AddShopSheet'
import { useShopNameForm } from '../hooks/useShopNameForm'
import { shopMeta } from '../lib/shopMeta'
import { strings } from '../strings'
import type { Shop } from '../types'
import '../../products/products.css'

export interface ShopListProps {
  shops: Shop[]
}

/** A ListGroup of Shops, each row linking to /settings/shops/:id with the meta "12 Prices · Location saved" (a pin icon when saved); EmptyState when none; "Add Shop" for every User (AddShopSheet). */
export function ShopList({ shops }: ShopListProps) {
  const [open, setOpen] = useState(false)
  return (
    <Stack>
      {shops.length === 0 ? (
        <EmptyState title={strings.shopsEmpty} />
      ) : (
        <ListGroup label={strings.shopsTitle}>
          {shops.map((s) => (
            <ListRow key={s.id} title={s.name} icon="shops" chevron href={`/settings/shops/${s.id}`} metaIcon={s.location ? 'location' : undefined} meta={shopMeta(s)} />
          ))}
        </ListGroup>
      )}
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {strings.addShop}
      </Button>
      <AddShopSheet open={open} onClose={() => setOpen(false)} onAdded={() => setOpen(false)} />
    </Stack>
  )
}

export interface ShopNameFormProps {
  initial: string
  submitLabel: string
  onSubmit: (name: string) => Promise<void>
}

/** A single Shop name field with a submit button; an empty name is the field's error, a rejection is the form's (FormError). */
export function ShopNameForm({ initial, submitLabel, onSubmit }: ShopNameFormProps) {
  const form = useShopNameForm(initial, onSubmit)
  return (
    <form
      ref={form.formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      <Stack>
        <TextField label={strings.shopNameLabel} value={form.name} onChange={form.setName} error={form.nameError ?? undefined} />
        <FormError>{form.formError}</FormError>
        <Button type="submit" loading={form.saving}>
          {submitLabel}
        </Button>
      </Stack>
    </form>
  )
}
