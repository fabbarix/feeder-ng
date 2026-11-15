import { useEffect, useRef, useState, type ReactElement } from 'react'
import { BottomSheet, Button, Chip, FormActions, Muted, Stack, Switch, TextField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { ApiError } from '../../../lib/http'
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
  const [nameError, setNameError] = useState<string | null>(null)
  const [refusals, setRefusals] = useState(0)
  const [saving, setSaving] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  // SAFE-04: after a refused save, the invalid field takes the focus.
  useEffect(() => {
    if (refusals === 0) return
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [refusals])
  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)
        setNameError(null)
        onSave({ name: name.trim(), kind, default: isDefault })
          .catch((err: unknown) => {
            // A refusal that names the Name field (or a name already in use, 409 name_taken) is that field's own error; anything else is
            // the form's one alert.
            if (err instanceof ApiError && (err.details.field === 'name' || err.code === 'name_taken')) setNameError(err.message)
            else setError(errorText(err))
            setRefusals((n) => n + 1)
          })
          .finally(() => setSaving(false))
      }}
    >
      <Stack>
        <TextField
          label={strings.places.name}
          value={name}
          onChange={(v) => {
            setName(v)
            setNameError(null)
          }}
          helper={strings.places.nameHint}
          error={nameError ?? undefined}
        />
        <div className="stock-screen__filters" role="group" aria-label={strings.places.kind}>
          {STORAGE_KINDS.map((k) => (
            <Chip key={k} kind="filter" icon={KIND_ICON[k]} selected={kind === k} onClick={() => setKind(k)}>
              {strings.kinds[k]}
            </Chip>
          ))}
        </div>
        <Muted>{strings.places.kindHint[kind]}</Muted>
        <Switch label={strings.places.default} checked={isDefault} onChange={setDefault} />
        <FormError>{error}</FormError>
        <FormActions
          destructive={
            onDelete ? (
              <Button variant="danger-secondary" onClick={onDelete}>
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
      </Stack>
    </form>
  )
}
