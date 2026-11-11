import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import { emptyRuleForm, ruleFormError, ruleFormErrorField, ruleToForm, setKind, toRule, unitOptions, type RuleFormValues } from './ruleForm'

const filled = (over: Partial<RuleFormValues> = {}): RuleFormValues => ({ ...emptyRuleForm(), prefix: '21', ...over })

describe('emptyRuleForm', () => {
  it('starts as a weight rule in g with the common EAN layout', () => {
    expect(emptyRuleForm()).toEqual({
      prefix: '', kind: 'weight', unit: 'g',
      itemStart: '3', itemLength: '5', valueStart: '8', valueLength: '5', decimalPlaces: '0',
    })
  })
})

describe('toRule', () => {
  it('converts the text to a rule', () => {
    expect(toRule(filled({ unit: 'kg', decimalPlaces: '3' }))).toEqual({
      id: 0, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 },
      valueKind: 'weight', valueUnit: 'kg', decimalPlaces: 3,
    })
  })
  it('leaves the unit out of a price rule', () => {
    const rule = toRule(setKind(filled(), 'price'))!
    expect(rule.valueKind).toBe('price')
    expect(rule.valueUnit).toBeUndefined()
  })
  it.each(['', 'x', '1.5', '-1', ' '])('is null for the number %j', (bad) => {
    expect(toRule(filled({ itemStart: bad }))).toBeNull()
    expect(toRule(filled({ decimalPlaces: bad }))).toBeNull()
  })
})

describe('ruleToForm', () => {
  it('round-trips', () => {
    const f = filled({ unit: 'lb', decimalPlaces: '2', prefix: '02' })
    expect(ruleToForm(toRule(f)!)).toEqual(f)
  })
  it('shows a price rule with an empty unit', () => {
    const f = ruleToForm({ id: 4, prefix: '22', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'price', decimalPlaces: 0 })
    expect(f.unit).toBe('')
    expect(f.kind).toBe('price')
  })
})

describe('setKind', () => {
  it('resets the unit to match', () => {
    const price = setKind(filled({ unit: 'kg' }), 'price')
    expect(price.unit).toBe('')
    expect(setKind(price, 'weight').unit).toBe('g')
    expect(price.prefix).toBe('21')
  })
})

describe('ruleFormError', () => {
  it('is null for a good rule', () => {
    expect(ruleFormError(filled())).toBeNull()
    expect(ruleFormError(filled({ prefix: '02', unit: 'lb', decimalPlaces: '2' }))).toBeNull()
  })
  it('asks for numbers first', () => {
    expect(ruleFormError(filled({ valueLength: '' }))).toBe(strings.errNumber)
  })
  it.each([
    ['prefix', { prefix: '' }],
    ['prefix with letters', { prefix: '2x' }],
    ['item inside the prefix', { itemStart: '2' }],
    ['value past digit 12', { valueStart: '9' }],
    ['overlapping spans', { valueStart: '6' }],
    ['more decimals than digits', { decimalPlaces: '6' }],
  ])('explains a bad rule: %s', (_name, over) => {
    const msg = ruleFormError(filled(over))
    expect(msg).toBeTruthy()
    expect(msg).not.toBe(strings.errNumber)
  })
})

describe('unitOptions', () => {
  it('lists the weight units', () => {
    expect(unitOptions('weight', 'USD').map((o) => o.value)).toEqual(['g', 'kg', 'oz', 'lb'])
  })
  it('has one option for a price: the minor unit of the Currency', () => {
    expect(unitOptions('price', 'USD')).toEqual([{ value: '', label: strings.priceUnit('USD') }])
  })
})

describe('ruleFormErrorField (the field a validation reason is about)', () => {
  const base = (): RuleFormValues => emptyRuleForm()
  it('is null for a valid rule', () => expect(ruleFormErrorField({ ...base(), prefix: '21' })).toBeNull())
  it('an empty or non-digit prefix is the prefix', () => {
    expect(ruleFormErrorField(base())).toBe('prefix')
    expect(ruleFormErrorField({ ...base(), prefix: '2a' })).toBe('prefix')
  })
  it('a non-whole number is the first such field', () => {
    expect(ruleFormErrorField({ ...base(), prefix: '21', valueLength: '' })).toBe('valueLength')
    expect(ruleFormErrorField({ ...base(), prefix: '21', itemStart: 'x', valueLength: '' })).toBe('itemStart')
  })
  it('overlap and inside-the-prefix point at the value / item start', () => {
    expect(ruleFormErrorField({ ...base(), prefix: '21', valueStart: '6' })).toBe('valueStart')
    expect(ruleFormErrorField({ ...base(), prefix: '2100', itemStart: '3' })).toBe('itemStart')
  })
  it('decimal places beyond the value length is decimalPlaces', () => {
    expect(ruleFormErrorField({ ...base(), prefix: '21', decimalPlaces: '9' })).toBe('decimalPlaces')
  })
})
