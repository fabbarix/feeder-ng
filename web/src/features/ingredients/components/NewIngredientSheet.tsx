import { useState } from 'react'
import { BottomSheet, Button, Chip, TextField } from '../../../ui'
import type { BaseUnit } from '../../../lib/units'
import { errorMessage } from '../lib/errorMessage'
import { strings } from '../strings'
import '../ingredients.css'
import type { NewIngredient } from '../types'

export interface NewIngredientSheetProps {
  open: boolean
  onClose: () => void
  /** Rejects with ApiError; code 'name_taken' shows strings.nameTaken, 'invalid_ingredient' shows the server message. */
  onCreate: (body: NewIngredient) => Promise<unknown>
}

const BASE_UNITS: readonly BaseUnit[] = ['g', 'ml', 'piece']

/** BottomSheet "New Ingredient": Name field, Base Unit chips (g, ml, piece; none preselected), Create Ingredient (disabled until a name and Base Unit are set). Closes on success. */
export function NewIngredientSheet({ open, onClose, onCreate }: NewIngredientSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={strings.newIngredient}>
      {open ? <NewIngredientForm onClose={onClose} onCreate={onCreate} /> : null}
    </BottomSheet>
  )
}

/** The form itself; it mounts fresh each time the sheet opens. */
function NewIngredientForm({ onClose, onCreate }: Pick<NewIngredientSheetProps, 'onClose' | 'onCreate'>) {
  const [name, setName] = useState('')
  const [baseUnit, setBaseUnit] = useState<BaseUnit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim()
  const canCreate = trimmed !== '' && baseUnit !== null && !saving

  const submit = async () => {
    if (!baseUnit || trimmed === '') return
    setSaving(true)
    setError(null)
    try {
      await onCreate({ name: trimmed, baseUnit })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <TextField label={strings.nameLabel} value={name} onChange={setName} />
      <div role="group" aria-label={strings.baseUnitLabel} className="new-ingredient__units">
        {BASE_UNITS.map((b) => (
          <Chip key={b} kind="filter" selected={baseUnit === b} onClick={() => setBaseUnit(b)}>
            {b}
          </Chip>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <Button type="submit" disabled={!canCreate}>
        {strings.createIngredient}
      </Button>
    </form>
  )
}
