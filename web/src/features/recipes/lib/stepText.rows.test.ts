// RX-04: a Step is an R-E row: the Step text is the key, the state at the end is its time, the muted detail is its kind and what it needs.
import { describe, expect, it } from 'vitest'
import { garlic, flour } from '../fixtures.test-helper'
import { stepDetail, stepTime } from './stepText'

const refs = new Map([[garlic.id, garlic], [flour.id, flour]])
const step = (over: Partial<Parameters<typeof stepDetail>[0]> = {}) => ({ kind: 'active' as const, after: [] as number[], uses: [], ...over })

describe('stepTime (the state at the end of the row)', () => {
  it('an Active or Passive Step with a Duration says it: "10 min", "1 h 5 min"', () => {
    expect(stepTime({ kind: 'active', durationMinutes: 10, leadTimeMinutes: 0 })).toEqual({ text: '10 min', untimed: false })
    expect(stepTime({ kind: 'passive', durationMinutes: 65, leadTimeMinutes: 0 })).toEqual({ text: '1 h 5 min', untimed: false })
  })
  it('an Advance Step says its lead time before: "12 h before"', () => {
    expect(stepTime({ kind: 'advance', durationMinutes: 0, leadTimeMinutes: 720 })).toEqual({ text: '12 h before', untimed: false })
  })
  it('a Step without a Duration says "No time" and is flagged untimed (the row draws it muted)', () => {
    expect(stepTime({ kind: 'active', durationMinutes: 0, leadTimeMinutes: 0 })).toEqual({ text: 'No time', untimed: true })
    expect(stepTime({ kind: 'passive', durationMinutes: 0, leadTimeMinutes: 0 })).toEqual({ text: 'No time', untimed: true })
  })
})

describe('stepDetail (the muted line under the Step text)', () => {
  it('is the kind alone: "Active", "Passive", "Advance Step"', () => {
    expect(stepDetail(step(), refs, 'metric')).toBe('Active')
    expect(stepDetail(step({ kind: 'passive' }), refs, 'metric')).toBe('Passive')
    expect(stepDetail(step({ kind: 'advance' }), refs, 'metric')).toBe('Advance Step')
  })
  it('names what the Step uses: "Active · Uses 2 clove garlic"', () => {
    expect(stepDetail(step({ uses: [{ ingredientId: 7, quantity: 2, unit: 'clove' }] }), refs, 'metric')).toBe('Active · Uses 2 clove garlic')
  })
  it('names the Step it comes after (the stored index is 0-based): "Passive · After Step 2"', () => {
    expect(stepDetail(step({ kind: 'passive', after: [1] }), refs, 'metric')).toBe('Passive · After Step 2')
  })
  it('names two Steps: "After Steps 3 and 4", three: "After Steps 2, 3 and 4"', () => {
    expect(stepDetail(step({ after: [2, 3] }), refs, 'metric')).toBe('Active · After Steps 3 and 4')
    expect(stepDetail(step({ after: [1, 2, 3] }), refs, 'metric')).toBe('Active · After Steps 2, 3 and 4')
  })
  it('a Step that has both says "After" first, then what it uses', () => {
    expect(stepDetail(step({ kind: 'passive', after: [0], uses: [{ ingredientId: 8, quantity: 250, unit: 'g' }] }), refs, 'metric')).toBe('Passive · After Step 1 · Uses 250 g flour')
  })
  it('never carries the time: that is the state at the end of the row', () => {
    expect(stepDetail(step({ kind: 'passive' }), refs, 'metric')).not.toMatch(/min|\bh\b/)
  })
})
