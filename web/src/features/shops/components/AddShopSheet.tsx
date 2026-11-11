import { useState } from 'react'
import { BottomSheet, Button, TextField } from '../../../ui'
import { Switch } from '../../../ui/fields/Switch'
import { errorText } from '../../products/lib/productForm'
import { usePosition } from '../hooks/usePosition'
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
  const [name, setName] = useState(initialName)
  const [wanted, setWanted] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const usable = here.status === 'ready' && here.position !== null && goodForSaving(here.position)
  return (
    <form
      className="pg__stack"
      onSubmit={(e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)
        add(name.trim(), locationToSave(wanted, here.position))
          .then(onAdded)
          .catch((err: unknown) => setError(errorText(err)))
          .finally(() => setSaving(false))
      }}
    >
      <TextField label={strings.shopNameLabel} value={name} onChange={setName} />
      <Switch label={strings.saveLocationSwitch} checked={wanted && usable} disabled={!usable} onChange={setWanted} />
      <LocationStatus status={here.status} position={here.position} failure={here.failure} onRetry={here.locate} />
      {error ? (
        <p role="alert" className="pg__error">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={name.trim() === ''} loading={saving}>
        {strings.addShop}
      </Button>
    </form>
  )
}
