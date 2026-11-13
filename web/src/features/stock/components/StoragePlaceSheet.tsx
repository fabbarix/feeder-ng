import { useState, type ReactElement } from 'react'
import { BottomSheet, Button, Chip, FormActions, Switch, TextField } from '../../../ui'
import { errorText } from '../../products/lib/productForm'
import { KIND_ICON, STORAGE_KINDS } from '../lib/kinds'
import { stockStrings as strings } from '../strings'
import type { StorageKind, StoragePlace, StoragePlaceInput } from '../types'

export interface StoragePlaceSheetProps {
  /** null = closed; 'new' = add one; a Storage Place = edit it */
  editing: StoragePlace | 'new' | null
  onClose: () => void
  onSave: (input: StoragePlaceInput) => Promise<unknown>
  /** Present when editing: asks to confirm, then deletes. */
  onDelete?: () => void
}


/** Add or edit a Storage Place: a name, its kind (Pantry, Fridge or Freezer, one at a time) and "Default for new Stock". */
export function StoragePlaceSheet({ editing, onClose, onSave, onDelete }: StoragePlaceSheetProps): ReactElement {
  const title = editing === 'new' ? strings.places.add : strings.places.edit
  return (
    <BottomSheet open={editing !== null} onClose={onClose} title={title}>
      {editing !== null ? <PlaceForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onSave={onSave} onDelete={onDelete} /> : null}
    </BottomSheet>
  )
}

function PlaceForm({ initial, onSave, onDelete }: { initial: StoragePlace | null; onSave: StoragePlaceSheetProps['onSave']; onDelete?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<StorageKind>(initial?.kind ?? 'pantry')
  const [isDefault, setDefault] = useState(initial?.default ?? false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="pg__stack"
      onSubmit={(e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)
        onSave({ name: name.trim(), kind, default: isDefault })
          .catch((err: unknown) => setError(errorText(err)))
          .finally(() => setSaving(false))
      }}
    >
      <TextField label={strings.places.name} value={name} onChange={setName} helper={strings.places.nameHint} />
      <div className="stock-screen__filters" role="group" aria-label={strings.places.kind}>
        {STORAGE_KINDS.map((k) => (
          <Chip key={k} kind="filter" icon={KIND_ICON[k]} selected={kind === k} onClick={() => setKind(k)}>
            {strings.kinds[k]}
          </Chip>
        ))}
      </div>
      <p className="pg__muted">{strings.places.kindHint[kind]}</p>
      <Switch label={strings.places.default} checked={isDefault} onChange={setDefault} />
      {error ? (
        <p role="alert" className="pg__error">
          {error}
        </p>
      ) : null}
      <FormActions
        destructive={
          onDelete ? (
            <Button variant="danger-tertiary" onClick={onDelete}>
              {strings.places.delete}
            </Button>
          ) : undefined
        }
        primary={
          <Button type="submit" disabled={name.trim() === ''} loading={saving}>
            {strings.places.save}
          </Button>
        }
      />
    </form>
  )
}
