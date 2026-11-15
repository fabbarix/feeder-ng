// B9-40 review (P38): timerNames gives every Cook Mode timer a name of its own.
import { describe, expect, it } from 'vitest'
import type { CookTimer } from '../types'
import { timerNames } from './timers'

const t = (over: Partial<CookTimer>): CookTimer => ({
  id: 1, scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 600, state: 'running', remainingSeconds: 60, endsAt: null, startedAt: '', ...over,
})

describe('timerNames', () => {
  it('a title no other timer has stays as it is', () => {
    expect([...timerNames([t({ id: 1 }), t({ id: 2, label: 'Eggs', step: null, scope: null })]).values()]).toEqual(['Pre-heat the oven', 'Eggs'])
  })
  it('a shared title gets its Step', () => {
    const names = timerNames([t({ id: 1 }), t({ id: 2, label: 'Step 3: Pre-heat the oven', step: 2 })])
    expect(names.get(1)).toBe('Pre-heat the oven · Step 1')
    expect(names.get(2)).toBe('Pre-heat the oven · Step 3')
  })
  it('the same Step of two Recipes gets the Recipe too', () => {
    const names = timerNames([t({ id: 1, recipeName: 'Roast chicken' }), t({ id: 2, scope: 'recipe:8', recipeName: 'Green beans' })])
    expect(names.get(1)).toBe('Pre-heat the oven · Step 1 · Roast chicken')
    expect(names.get(2)).toBe('Pre-heat the oven · Step 1 · Green beans')
  })
  it('two free timers of one label are numbered', () => {
    const names = timerNames([t({ id: 1, label: 'Eggs', step: null, scope: null }), t({ id: 2, label: 'Eggs', step: null, scope: null })])
    expect([...names.values()]).toEqual(['Eggs (1)', 'Eggs (2)'])
  })
})
