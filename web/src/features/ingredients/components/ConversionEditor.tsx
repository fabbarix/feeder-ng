import { Button } from '../../../ui'
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
              <Button variant="ghost" onClick={() => onRemove(c.unit)}>
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
        <label>
          {strings.conversionUnitLabel}
          <input value={form.unit} onChange={(e) => form.setUnit(e.target.value)} />
        </label>
        <label>
          {amountLabel}
          <input inputMode="decimal" value={form.amount} onChange={(e) => form.setAmount(e.target.value)} />
        </label>
        <Button type="submit" variant="tonal">
          {strings.addConversion}
        </Button>
        {form.error ? <p role="alert">{form.error}</p> : null}
      </form>
    </section>
  )
}
