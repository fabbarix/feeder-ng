import { describe, expect, it } from 'vitest'
import type { StepDraft } from './draft'
import { addUse, newUseDraft, removeUse, setStepImage, updateUse } from './stepUses'

const step = (key: string, over: Partial<StepDraft> = {}): StepDraft => ({
  key, text: key, kind: 'active', durationMinutes: '', leadTimeMinutes: '', after: [], uses: [], image: '', ...over,
})
let n = 0
const use = (ingredientId: number | null, quantity = '1', unit = 'g') => ({ key: `u${++n}`, ingredientId, ingredientName: '', quantity, unit })

describe('Step uses', () => {
  it('a new use is blank', () => {
    expect(newUseDraft()).toEqual({ key: expect.any(String), ingredientId: null, ingredientName: '', quantity: '', unit: '' })
  })
  it('gives every use its own stable React key (rows must not be keyed by index)', () => {
    const a = newUseDraft()
    const b = newUseDraft()
    expect(a.key).not.toBe('')
    expect(a.key).not.toBe(b.key)
    const steps = [step('a', { uses: [a, b] })]
    const updated = updateUse(steps, 0, 1, { quantity: '9' })
    expect(updated[0]!.uses.map((u) => u.key)).toEqual([a.key, b.key])
    expect(removeUse(steps, 0, 0)[0]!.uses.map((u) => u.key)).toEqual([b.key])
  })
  it('adds a blank use to one Step only', () => {
    const steps = [step('a'), step('b')]
    const next = addUse(steps, 1)
    expect(next[1]!.uses).toEqual([{ ...newUseDraft(), key: expect.any(String) }])
    expect(next[0]).toBe(steps[0])
  })
  it('patches one use and leaves the others', () => {
    const steps = [step('a', { uses: [use(7), use(8, '2', 'kg')] })]
    const next = updateUse(steps, 0, 1, { quantity: '3' })
    expect(next[0]!.uses.map((u) => u.quantity)).toEqual(['1', '3'])
    expect(next[0]!.uses[1]).toMatchObject({ ingredientId: 8, unit: 'kg' })
    expect(steps[0]!.uses[1]!.quantity).toBe('2')
  })
  it('removes one use and keeps the order of the rest', () => {
    const steps = [step('a', { uses: [use(7), use(8), use(9)] })]
    expect(removeUse(steps, 0, 1)[0]!.uses.map((u) => u.ingredientId)).toEqual([7, 9])
  })
  it('sets and clears the Step photo', () => {
    const steps = [step('a'), step('b')]
    const set = setStepImage(steps, 0, 'img1')
    expect(set[0]!.image).toBe('img1')
    expect(set[1]).toBe(steps[1])
    expect(setStepImage(set, 0, '')[0]!.image).toBe('')
  })
})
