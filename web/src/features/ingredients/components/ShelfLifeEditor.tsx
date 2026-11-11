import { Button, FormActions, NumberField } from '../../../ui'
import { useShelfLifeForm } from '../hooks/useIngredientForms'
import { MAX_SHELF_LIFE_DAYS } from '../lib/conversionForm'
import { strings } from '../strings'

export interface ShelfLifeEditorProps {
  days: number | null
  onSave: (days: number | null) => void
  /** Pantry: the same editor for the frozen Shelf Life ("Frozen Shelf Life", its own buttons and empty text). */
  variant?: 'shelfLife' | 'frozen'
}

const COPY = {
  shelfLife: { label: strings.shelfLifeLabel, save: strings.saveShelfLife, clear: strings.clearShelfLife, none: strings.noShelfLife },
  frozen: { label: strings.frozenShelfLifeLabel, save: strings.saveFrozenShelfLife, clear: strings.clearFrozenShelfLife, none: strings.noFrozenShelfLife },
}

/** One "Shelf Life" number field (1 day minimum, "days" inside it; blank means none), "Save Shelf Life", and "Clear Shelf Life" (only while set). */
export function ShelfLifeEditor({ days, onSave, variant = 'shelfLife' }: ShelfLifeEditorProps) {
  const copy = COPY[variant]
  const form = useShelfLifeForm(days, onSave)
  return (
    <section>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.submit()
        }}
      >
        <NumberField
          size="xs"
          label={copy.label}
          unit="days"
          min={1}
          max={MAX_SHELF_LIFE_DAYS}
          value={form.value}
          onChange={form.setValue}
          helper={form.value === null ? copy.none : variant === 'frozen' ? strings.frozenShelfLifeHint : undefined}
          error={form.error ?? undefined}
        />
        <FormActions
          destructive={
            days !== null ? (
              <Button variant="danger-tertiary" onClick={form.clear}>
                {copy.clear}
              </Button>
            ) : undefined
          }
          primary={<Button type="submit">{copy.save}</Button>}
        />
      </form>
    </section>
  )
}
