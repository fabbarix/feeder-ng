import { Button, FieldRow, TextField } from '../../../ui'
import { baseUnitLabel, formatConversion, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { useConversionForm } from '../hooks/useIngredientForms'
import { strings } from '../strings'
import type { Conversion } from '../types'

export interface ConversionEditorProps {
  conversions: readonly Conversion[]
  base: BaseUnit
  system: UnitSystem
  onAdd: (c: Conversion) => void
  onRemove: (unit: string) => void
}

/**
 * "Unit Conversions": a line per conversion (formatConversion) with a "Remove <unit>" button, or
 * strings.noConversions; then the add form: Unit, "Amount in g|ml|piece" (always the metric Base Unit
 * label, since the stored value is metric), "Add conversion". Errors from useConversionForm show inline (role alert).
 */
export function ConversionEditor({ conversions, base, system, onAdd, onRemove }: ConversionEditorProps) {
  const form = useConversionForm(base, conversions.map((c) => c.unit), onAdd)
  const amountLabel = strings.conversionAmountLabel(baseUnitLabel(base, 'metric'))

  return (
    <section>
      <h2>{strings.conversionsTitle}</h2>
      {conversions.length === 0 ? (
        <p>{strings.noConversions}</p>
      ) : (
        <ul>
          {conversions.map((c) => (
            <li key={c.unit}>
              <span>{formatConversion(c.unit, c.toBase, base, system)}</span>{' '}
              <Button variant="tertiary" onClick={() => onRemove(c.unit)}>
                {strings.removeConversion(c.unit)}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.submit()
        }}
      >
        <FieldRow align="end">
          <TextField size="sm" label={strings.conversionUnitLabel} value={form.unit} onChange={form.setUnit} />
          <TextField size="sm" label={amountLabel} inputMode="decimal" value={form.amount} onChange={form.setAmount} />
          <Button type="submit" variant="secondary">
            {strings.addConversion}
          </Button>
        </FieldRow>
        {form.error ? <p role="alert">{form.error}</p> : null}
      </form>
    </section>
  )
}
