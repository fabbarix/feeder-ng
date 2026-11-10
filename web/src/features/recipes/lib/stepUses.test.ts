import { describe, expect, it } from 'vitest'
import type { StepDraft } from './draft'
import { addUse, newUseDraft, removeUse, setStepImage, updateUse } from './stepUses'

const step = (key: string, over: Partial<StepDraft> = {}): StepDraft => ({
  key, text: key, kind: 'active', durationMinutes: '', leadTimeMinutes: '', after: [], uses: [], image: '', ...over,
})
const use = (ingredientId: number | null, quantity = '1', unit = 'g') => ({ ingredientId, ingredientName: '', quantity, unit })

describe('Step uses', () => {
  it('a new use is blank', () => {
    expect(newUseDraft()).toEqual({ ingredientId: null, ingredientName: '', quantity: '', unit: '' })
  })
  it('adds a blank use to one Step only', () => {
    const steps = [step('a'), step('b')]
    const next = addUse(steps, 1)
    expect(next[1]!.uses).toEqual([newUseDraft()])
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
