// Weight Barcode Rule form: text inputs <-> WeightRule. Plain TypeScript, no React.
import type { ValueKind, ValueUnit, WeightRule } from '../../scan/lib/barcode'

/** Every field is the text of an input. unit is '' for a price rule. */
export interface RuleFormValues {
  prefix: string
  kind: ValueKind
  unit: '' | ValueUnit
  itemStart: string
  itemLength: string
  valueStart: string
  valueLength: string
  decimalPlaces: string
}

/** Defaults of a new rule: weight in g, item digits 3-7, value digits 8-12, 0 decimal places, empty prefix. */
export function emptyRuleForm(): RuleFormValues {
  throw new Error('TODO')
}

export function ruleToForm(rule: WeightRule): RuleFormValues {
  void rule
  throw new Error('TODO')
}

/**
 * Switches the value kind: to 'price' the unit becomes ''; to 'weight' it becomes 'g'.
 * Everything else is kept.
 */
export function setKind(v: RuleFormValues, kind: ValueKind): RuleFormValues {
  void v; void kind
  throw new Error('TODO')
}

/** null when any of the five numeric fields is not a whole number (empty counts). id is 0; a price rule has no valueUnit. */
export function toRule(v: RuleFormValues): WeightRule | null {
  void v
  throw new Error('TODO')
}

/** The message to show: strings.errNumber, else `validateRule`'s reason; null when the rule is fine. */
export function ruleFormError(v: RuleFormValues): string | null {
  void v
  throw new Error('TODO')
}

/** Choices for the unit select: weight -> g, kg, oz, lb; price -> one option ('' = the Currency's minor unit). */
export function unitOptions(kind: ValueKind, currency: string): { value: '' | ValueUnit; label: string }[] {
  void kind; void currency
  throw new Error('TODO')
}
