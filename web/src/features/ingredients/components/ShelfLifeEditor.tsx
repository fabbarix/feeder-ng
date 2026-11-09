import { Button } from '../../../ui'
import { useShelfLifeForm } from '../hooks/useIngredientForms'
import { strings } from '../strings'

export interface ShelfLifeEditorProps {
  days: number | null
  onSave: (days: number | null) => void
}

/** Shows strings.shelfLife(days) or strings.noShelfLife; a "Shelf Life (days)" input, "Save Shelf Life", and "Clear Shelf Life" (only while set). Invalid text shows the error (role alert) and does not save. */
export function ShelfLifeEditor({ days, onSave }: ShelfLifeEditorProps) {
  const form = useShelfLifeForm(days, onSave)
  return (
    <section>
      <p>{days === null ? strings.noShelfLife : strings.shelfLife(days)}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.submit()
        }}
      >
        <label>
          {strings.shelfLifeLabel}
          <input inputMode="numeric" value={form.text} onChange={(e) => form.setText(e.target.value)} />
        </label>
        <Button type="submit" variant="tonal">
          {strings.saveShelfLife}
        </Button>
        {days !== null ? (
          <Button variant="ghost" onClick={form.clear}>
            {strings.clearShelfLife}
          </Button>
        ) : null}
        {form.error ? <p role="alert">{form.error}</p> : null}
      </form>
    </section>
  )
}
