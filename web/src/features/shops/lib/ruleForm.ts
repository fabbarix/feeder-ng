// Weight Barcode Rule form: text inputs <-> WeightRule. Plain TypeScript, no React.
import { validateRule, type ValueKind, type ValueUnit, type WeightRule } from '../../scan/lib/barcode'
import { strings } from '../strings'

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
  return {
    prefix: '', kind: 'weight', unit: 'g',
    itemStart: '3', itemLength: '5', valueStart: '8', valueLength: '5', decimalPlaces: '0',
  }
}

export function ruleToForm(rule: WeightRule): RuleFormValues {
  return {
    prefix: rule.prefix,
    kind: rule.valueKind,
    unit: rule.valueKind === 'price' ? '' : (rule.valueUnit ?? 'g'),
    itemStart: String(rule.item.start),
    itemLength: String(rule.item.length),
    valueStart: String(rule.value.start),
    valueLength: String(rule.value.length),
    decimalPlaces: String(rule.decimalPlaces),
  }
}

/**
 * Switches the value kind: to 'price' the unit becomes ''; to 'weight' it becomes 'g'.
 * Everything else is kept.
 */
export function setKind(v: RuleFormValues, kind: ValueKind): RuleFormValues {
  return { ...v, kind, unit: kind === 'price' ? '' : 'g' }
}

function whole(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null
}

/** null when any of the five numeric fields is not a whole number (empty counts). id is 0; a price rule has no valueUnit. */
export function toRule(v: RuleFormValues): WeightRule | null {
  const itemStart = whole(v.itemStart)
  const itemLength = whole(v.itemLength)
  const valueStart = whole(v.valueStart)
  const valueLength = whole(v.valueLength)
  const decimalPlaces = whole(v.decimalPlaces)
  if (itemStart === null || itemLength === null || valueStart === null || valueLength === null || decimalPlaces === null) {
    return null
  }
  const rule: WeightRule = {
    id: 0,
    prefix: v.prefix,
    item: { start: itemStart, length: itemLength },
    value: { start: valueStart, length: valueLength },
    valueKind: v.kind,
    decimalPlaces,
  }
  if (v.kind === 'weight') rule.valueUnit = v.unit === '' ? 'g' : v.unit
  return rule
}

/** The message to show: strings.errNumber, else `validateRule`'s reason; null when the rule is fine. */
export function ruleFormError(v: RuleFormValues): string | null {
  const rule = toRule(v)
  if (rule === null) return strings.errNumber
  return validateRule(rule)
}

/** The field the validation reason is about (to mark it invalid and focus it); null when the rule is fine. */
export function ruleFormErrorField(v: RuleFormValues): RuleFormField | null {
  const rule = toRule(v)
  if (rule === null) {
    return RULE_NUMBER_FIELDS.find((f) => whole(v[f]) === null) ?? null
  }
  const reason = validateRule(rule)
  if (reason === null) return null
  if (reason.startsWith('prefix')) return 'prefix'
  if (reason.startsWith('item starts')) return 'itemStart'
  if (reason.startsWith('decimal')) return 'decimalPlaces'
  if (reason.startsWith('value starts') || reason.includes('overlap')) return 'valueStart'
  return spanField(rule)
}

/** The field of the first span that is not valid (a start below 1 or a length below 1). */
function spanField(rule: WeightRule): RuleFormField {
  if (rule.item.start < 1) return 'itemStart'
  if (rule.item.length < 1) return 'itemLength'
  if (rule.value.start < 1) return 'valueStart'
  return 'valueLength'
}

const RULE_NUMBER_FIELDS = ['itemStart', 'itemLength', 'valueStart', 'valueLength', 'decimalPlaces'] as const
export type RuleFormField = 'prefix' | (typeof RULE_NUMBER_FIELDS)[number]

/** Choices for the unit select: weight -> g, kg, oz, lb; price -> one option ('' = the Currency's minor unit). */
export function unitOptions(kind: ValueKind, currency: string): { value: '' | ValueUnit; label: string }[] {
  if (kind === 'price') return [{ value: '', label: strings.priceUnit(currency) }]
  return (['g', 'kg', 'oz', 'lb'] as const).map((u) => ({ value: u, label: u }))
}
