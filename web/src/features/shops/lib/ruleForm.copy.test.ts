// B9-30 (SAFE-04): the Weight Barcode Rule's messages are sentences a person can act on, not the scan library's lower-case reasons
// ("prefix must be one or more digits"). The mapping lives in features/shops/lib/ruleForm.ts (ruleFormError); scan/lib/barcode.ts is not
// this package's file and keeps its reasons.
import { describe, expect, it } from 'vitest'
import { emptyRuleForm, ruleFormError, type RuleFormValues } from './ruleForm'
import { strings } from '../strings'

const filled = (over: Partial<RuleFormValues> = {}): RuleFormValues => ({ ...emptyRuleForm(), prefix: '21', ...over })

describe('Weight Barcode Rule messages', () => {
  it('the prefix message is the chapter\'s', () => {
    expect(ruleFormError(filled({ prefix: '' }))).toBe('Enter the prefix as digits, for example 21.')
    expect(ruleFormError(filled({ prefix: '2x' }))).toBe('Enter the prefix as digits, for example 21.')
    expect(strings.errPrefix).toBe('Enter the prefix as digits, for example 21.')
  })

  it.each([
    ['item inside the prefix', { itemStart: '2' }],
    ['value starts inside the prefix', { valueStart: '2' }],
    ['value past digit 12', { valueStart: '9' }],
    ['overlapping spans', { valueStart: '6' }],
    ['more decimals than digits', { decimalPlaces: '6' }],
    ['not a number', { valueLength: '' }],
  ])('%s: a sentence that starts with a capital letter and ends with a full stop', (_name, over) => {
    const message = ruleFormError(filled(over))
    expect(message).toMatch(/^[A-Z].*\.$/)
  })
})
