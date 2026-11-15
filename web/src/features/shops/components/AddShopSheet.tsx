import { useState } from 'react'
import { BottomSheet, Button, Stack, TextField } from '../../../ui'
import { Switch } from '../../../ui/fields/Switch'
import { FormError } from '../../../ui/fields/FormError'
import { usePosition } from '../hooks/usePosition'
import { useShopNameForm } from '../hooks/useShopNameForm'
import { useShops } from '../hooks/useShops'
import { goodForSaving, locationToSave } from '../lib/nearest'
import { strings } from '../strings'
import type { Shop } from '../types'
import { LocationStatus } from './LocationStatus'

export interface AddShopSheetProps {
  open: boolean
  onClose: () => void
  /** e.g. what was typed in a Shop search */
  initialName?: string
  onAdded: (shop: Shop) => void
}

/** "Add Shop" for any User, who is assumed to be standing in it: a name, and the phone's position offered as its Shop Location. */
export function AddShopSheet({ open, onClose, initialName = '', onAdded }: AddShopSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={strings.addShop}>
      {open ? <AddShopForm initialName={initialName} onAdded={onAdded} /> : null}
    </BottomSheet>
  )
}

function AddShopForm({ initialName, onAdded }: { initialName: string; onAdded: (shop: Shop) => void }) {
  const { add } = useShops()
  const here = usePosition({ auto: 'always' })
  const [wanted, setWanted] = useState(true)
  const form = useShopNameForm(initialName, async (name) => onAdded(await add(name, locationToSave(wanted, here.position))))
  const usable = here.status === 'ready' && here.position !== null && goodForSaving(here.position)
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
        <Switch label={strings.saveLocationSwitch} checked={wanted && usable} disabled={!usable} onChange={setWanted} />
        <LocationStatus status={here.status} position={here.position} failure={here.failure} onRetry={here.locate} />
        <FormError>{form.formError}</FormError>
        <Button type="submit" loading={form.saving}>
          {strings.addShop}
        </Button>
      </Stack>
    </form>
  )
}
