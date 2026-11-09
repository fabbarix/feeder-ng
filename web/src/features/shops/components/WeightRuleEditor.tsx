import type { RuleBody } from '../api'
import type { ShopRule } from '../types'

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
export function WeightRuleEditor(props: WeightRuleEditorProps): never {
  void props
  throw new Error('TODO')
}
