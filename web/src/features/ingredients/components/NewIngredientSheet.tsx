import { useState } from 'react'
import { BottomSheet, Button, Chip, TextField } from '../../../ui'
import type { BaseUnit } from '../../../lib/units'
import { errorMessage } from '../lib/errorMessage'
import { strings } from '../strings'
import '../ingredients.css'
import type { Ingredient, NewIngredient, SearchResult } from '../types'

export interface NewIngredientSheetProps {
  open: boolean
  onClose: () => void
  /** Rejects with ApiError; code 'name_taken' shows strings.nameTaken, 'invalid_ingredient' shows the server message. */
  onCreate: (body: NewIngredient) => Promise<unknown>
  /** R14: the name to prefill (quick create from a Recipe line). */
  initialName?: string
  /** R14: a unit already known (Recipe line, Scan); lib/newIngredient.defaultBaseUnit turns it into the preselected Base Unit. */
  unitHint?: string
  /** R14: near-duplicate lookup; default ingredientsApi.search (the matcher Import Review uses). A rejection is ignored. */
  findSimilar?: (name: string) => Promise<SearchResult>
  /** R14: offered next to "Did you mean" and "already exists"; picking calls it with the Ingredient and closes the sheet. Without it those rows only warn. */
  onUseExisting?: (ingredient: Ingredient) => void
  /** R14: when set, Create is disabled and this reason is shown (offline). */
  disabledReason?: string
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
