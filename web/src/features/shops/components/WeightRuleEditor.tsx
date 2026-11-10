import { Button, Select, TextField } from '../../../ui'
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
 * start/length, value kind (Select: weight | price), unit (Select, unitOptions), decimal places,
 * and a "Sample barcode" field whose live decode is shown through RulePreview in an element with
 * role="status". The Save button is disabled while ruleFormError is not null, and the error is shown.
 * All logic lives in lib/ruleForm and lib/rulePreview (via useRuleForm).
 */
export function WeightRuleEditor({ initial, currency, onSave, onCancel }: WeightRuleEditorProps) {
  const form = useRuleForm(initial, onSave)
  const v = form.values
  const text = (label: string, field: 'prefix' | 'itemStart' | 'itemLength' | 'valueStart' | 'valueLength' | 'decimalPlaces') => (
    <TextField label={label} inputMode="numeric" value={v[field]} onChange={(value) => form.setField(field, value)} />
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
      <Select<ValueKind>
        label={strings.valueKindLabel}
        options={[
          { value: 'weight', label: strings.kindWeight },
          { value: 'price', label: strings.kindPrice },
        ]}
        value={v.kind}
        onChange={(kind) => form.setField('kind', kind)}
      />
      <Select
        label={strings.valueUnitLabel}
        options={unitOptions(v.kind, currency).map((o) => ({ value: o.value, label: o.label }))}
        value={v.unit}
        onChange={(unit) => form.setField('unit', unit)}
      />
      {text(strings.decimalPlacesLabel, 'decimalPlaces')}
      <TextField label={strings.sampleLabel} helper={strings.sampleHint} inputMode="numeric" value={form.sample} onChange={form.setSample} />
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
        <Button variant="tertiary" onClick={onCancel}>
          {strings.cancel}
        </Button>
      </div>
    </form>
  )
}
