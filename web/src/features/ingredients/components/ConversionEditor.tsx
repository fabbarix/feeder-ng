import { useRef } from 'react'
import { Button, FieldRow, ListGroup, ListRow, TextField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { baseUnitLabel, formatConversion, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { useConversionForm } from '../hooks/useIngredientForms'
import { strings } from '../strings'
import '../ingredients.css'
import type { Conversion } from '../types'

export interface ConversionEditorProps {
  conversions: readonly Conversion[]
  base: BaseUnit
  system: UnitSystem
  /** May return a Promise: a rejection shows its words as the form's FormError and keeps what was typed. */
  onAdd: (c: Conversion) => unknown
  onRemove: (unit: string) => void
  /** BR-D: units set by the Base recipe's Yield (batch, portion): shown read-only with "Set by the Base recipe". */
  lockedUnits?: readonly string[]
}

/**
 * "Unit Conversions": a line per conversion (formatConversion) with a "Remove <unit>" button, or
 * strings.noConversions; then the add form: Unit, "Amount in g|ml|piece" (always the metric Base Unit
 * label, since the stored value is metric), "Add conversion". Errors from useConversionForm show inline (role alert).
 */
export function ConversionEditor({ conversions, base, system, onAdd, onRemove, lockedUnits = [] }: ConversionEditorProps) {
  const form = useConversionForm(base, conversions.map((c) => c.unit), onAdd)
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstInvalid(formRef, form.errors, form.submitCount)
  const amountLabel = strings.conversionAmountLabel(baseUnitLabel(base, 'metric'))

  return (
    <section className="conversion-editor">
      <h2>{strings.conversionsTitle}</h2>
      {conversions.length === 0 ? (
        <p>{strings.noConversions}</p>
      ) : (
        <ListGroup label={strings.conversionsTitle}>
          {conversions.map((c) => (
            <ListRow
              key={c.unit}
              title={formatConversion(c.unit, c.toBase, base, system)}
              trailing={
                lockedUnits.includes(c.unit) ? (
                  <span className="ingredient__locked">{strings.setByBaseRecipe}</span>
                ) : (
                  <Button variant="secondary" onClick={() => onRemove(c.unit)}>
                    {strings.removeConversion(c.unit)}
                  </Button>
                )
              }
            />
          ))}
        </ListGroup>
      )}
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void form.submit()
        }}
      >
        <FieldRow align="end">
          <TextField size="sm" label={strings.conversionUnitLabel} value={form.unit} onChange={form.setUnit} error={form.errors.unit} autoComplete="off" />
          <TextField size="sm" label={amountLabel} inputMode="decimal" value={form.amount} onChange={form.setAmount} error={form.errors.amount} autoComplete="off" />
          <Button type="submit" variant="secondary">
            {strings.addConversion}
          </Button>
        </FieldRow>
        <FormError>{form.failure}</FormError>
      </form>
    </section>
  )
}
