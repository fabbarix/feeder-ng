import { useId } from 'react'
import { BottomSheet, FieldRow, SectionTitle, Select, Stack, TextField } from '../../../ui'
import type { ValueKind } from '../../scan/lib/barcode'
import type { RuleBody } from '../api'
import { useRuleForm } from '../hooks/useRuleForm'
import { unitOptions, type RuleFormField } from '../lib/ruleForm'
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
 * role="status". The reason of an invalid rule shows after Save is pressed (which then does not save).
 * All logic lives in lib/ruleForm and lib/rulePreview (via useRuleForm). It is the "Add rule" / "Edit rule" sheet: Cancel and Save
 * are its footer (VC2: no Close); the caller mounts it while it is open, so every open starts a fresh form.
 */
export function WeightRuleEditor({ initial, currency, onSave, onCancel }: WeightRuleEditorProps) {
  const form = useRuleForm(initial, onSave)
  const formId = useId()
  const v = form.values
  const text = (label: string, field: RuleFormField | 'decimalPlaces', size: 'xs' | 'sm' = 'xs') => (
    <TextField
      id={form.fieldId(field)}
      size={size}
      label={label}
      inputMode="numeric"
      value={v[field]}
      error={form.errorField === field ? (form.shownError ?? undefined) : undefined}
      onChange={(value) => form.setField(field, value)}
    />
  )
  return (
    <BottomSheet
      open
      onClose={onCancel}
      onCancel={onCancel}
      cancelLabel={strings.cancel}
      submit={{ label: strings.saveRule, form: formId, loading: form.saving }}
      title={initial ? strings.editRule : strings.addRule}
    >
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void form.submit()
        }}
      >
        <Stack>
          {text(strings.prefixLabel, 'prefix', 'sm')}
          <div>
            <SectionTitle as="h3">{strings.itemCodeGroup}</SectionTitle>
            <FieldRow label={strings.itemCodeGroup}>
              {text(strings.itemStartLabel, 'itemStart')}
              {text(strings.itemLengthLabel, 'itemLength')}
            </FieldRow>
          </div>
          <div>
            <SectionTitle as="h3">{strings.valueGroup}</SectionTitle>
            <FieldRow label={strings.valueGroup}>
              {text(strings.valueStartLabel, 'valueStart')}
              {text(strings.valueLengthLabel, 'valueLength')}
              {text(strings.decimalPlacesLabel, 'decimalPlaces')}
            </FieldRow>
          </div>
          <FieldRow>
            <Select<ValueKind>
              size="md"
              label={strings.valueKindLabel}
              options={[
                { value: 'weight', label: strings.kindWeight },
                { value: 'price', label: strings.kindPrice },
              ]}
              value={v.kind}
              onChange={(kind) => form.setField('kind', kind)}
            />
            <Select
              size="md"
              label={strings.valueUnitLabel}
              options={unitOptions(v.kind, currency).map((o) => ({ value: o.value, label: o.label }))}
              value={v.unit}
              onChange={(unit) => form.setField('unit', unit)}
            />
          </FieldRow>
          <TextField label={strings.sampleLabel} helper={strings.sampleHint} inputMode="numeric" data-size-intent="long" value={form.sample} onChange={form.setSample} />
          <RulePreview preview={form.preview} currency={currency} unit={v.unit} />
          {form.shownError && form.errorField === null ? (
            <p role="alert" className="pg__error">
              {form.shownError}
            </p>
          ) : null}
          {form.serverError ? (
            <p role="alert" className="pg__error">
              {form.serverError}
            </p>
          ) : null}
        </Stack>
      </form>
    </BottomSheet>
  )
}
