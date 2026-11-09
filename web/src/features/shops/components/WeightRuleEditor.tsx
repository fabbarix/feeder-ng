import { Button } from '../../../ui'
import { FormField } from '../../products/components/FormField'
import type { ValueKind } from '../../scan/lib/barcode'
import type { RuleBody } from '../api'
import { useRuleForm } from '../hooks/useRuleForm'
import { unitOptions } from '../lib/ruleForm'
import { strings } from '../strings'
import type { ShopRule } from '../types'
import { RulePreview } from './RulePreview'

export interface WeightRuleEditorProps {
  /** present when editing */
  initial?: ShopRule
  /** the Household Currency, for the price unit label and the preview */
  currency: string
  /** Called with the rule (no id); a rejection's message is shown in an alert. */
  onSave: (rule: RuleBody) => Promise<void>
  onCancel: () => void
}

/**
 * Form for one Weight Barcode Rule (labels from strings): prefix, item start/length, value
 * start/length, value kind select (weight | price), unit select (unitOptions), decimal places,
 * and a "Sample barcode" input whose live decode is shown through RulePreview in
 * an element with role="status". The Save button is disabled while ruleFormError is not null,
 * and the error is shown. All logic lives in lib/ruleForm and lib/rulePreview (via useRuleForm).
 */
export function WeightRuleEditor({ initial, currency, onSave, onCancel }: WeightRuleEditorProps) {
  const form = useRuleForm(initial, onSave)
  const v = form.values
  const text = (label: string, field: 'prefix' | 'itemStart' | 'itemLength' | 'valueStart' | 'valueLength' | 'decimalPlaces') => (
    <FormField label={label}>
      {(c) => (
        <input {...c} type="text" inputMode="numeric" value={v[field]} onChange={(e) => form.setField(field, e.target.value)} />
      )}
    </FormField>
  )
  return (
    <form
      className="pg__stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      {text(strings.prefixLabel, 'prefix')}
      {text(strings.itemStartLabel, 'itemStart')}
      {text(strings.itemLengthLabel, 'itemLength')}
      {text(strings.valueStartLabel, 'valueStart')}
      {text(strings.valueLengthLabel, 'valueLength')}
      <FormField label={strings.valueKindLabel}>
        {(c) => (
          <select {...c} value={v.kind} onChange={(e) => form.setField('kind', e.target.value as ValueKind)}>
            <option value="weight">{strings.kindWeight}</option>
            <option value="price">{strings.kindPrice}</option>
          </select>
        )}
      </FormField>
      <FormField label={strings.valueUnitLabel}>
        {(c) => (
          <select {...c} value={v.unit} onChange={(e) => form.setField('unit', e.target.value)}>
            {unitOptions(v.kind, currency).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </FormField>
      {text(strings.decimalPlacesLabel, 'decimalPlaces')}
      <FormField label={strings.sampleLabel} hint={strings.sampleHint}>
        {(c) => (
          <input {...c} type="text" inputMode="numeric" value={form.sample} onChange={(e) => form.setSample(e.target.value)} />
        )}
      </FormField>
      <RulePreview preview={form.preview} currency={currency} unit={v.unit} />
      {form.error ? <p className="pg__error">{form.error}</p> : null}
      {form.serverError ? (
        <p role="alert" className="pg__error">
          {form.serverError}
        </p>
      ) : null}
      <div className="pg__row">
        <Button type="submit" disabled={form.error !== null} loading={form.saving}>
          {strings.saveRule}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {strings.cancel}
        </Button>
      </div>
    </form>
  )
}
