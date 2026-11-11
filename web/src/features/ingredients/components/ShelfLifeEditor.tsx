import { Button, FormActions, NumberField } from '../../../ui'
import { useShelfLifeForm } from '../hooks/useIngredientForms'
import { MAX_SHELF_LIFE_DAYS } from '../lib/conversionForm'
import { strings } from '../strings'

export interface ShelfLifeEditorProps {
  days: number | null
  onSave: (days: number | null) => void
}

/** One "Shelf Life" number field (1 day minimum, "days" inside it; blank means none), "Save Shelf Life", and "Clear Shelf Life" (only while set). */
export function ShelfLifeEditor({ days, onSave }: ShelfLifeEditorProps) {
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
          label={strings.shelfLifeLabel}
          unit="days"
          min={1}
          max={MAX_SHELF_LIFE_DAYS}
          value={form.value}
          onChange={form.setValue}
          helper={form.value === null ? strings.noShelfLife : undefined}
          error={form.error ?? undefined}
        />
        <FormActions
          destructive={
            days !== null ? (
              <Button variant="danger-tertiary" onClick={form.clear}>
                {strings.clearShelfLife}
              </Button>
            ) : undefined
          }
          primary={<Button type="submit">{strings.saveShelfLife}</Button>}
        />
      </form>
    </section>
  )
}
