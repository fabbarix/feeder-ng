import { describe, expect, it } from 'vitest'
import type { CookTimer } from '../types'
import { adjustReheatSeconds, cookReheatPath, defaultReheatSeconds, REHEAT_LABEL, reheatTimerOf } from './reheat'

const timer = (over: Partial<CookTimer> = {}): CookTimer => ({
  id: 1, scope: 'meal:2026-11-10/2', step: null, label: REHEAT_LABEL, durationSeconds: 120, state: 'running', remainingSeconds: 100,
  endsAt: '2026-11-10T18:02:00Z', startedAt: '2026-11-10T18:00:00Z', ...over,
})

describe('defaultReheatSeconds', () => {
  it('is 2 minutes for one portion, plus 1 minute for each further portion', () => {
    expect(defaultReheatSeconds(1)).toBe(120)
    expect(defaultReheatSeconds(2)).toBe(180)
    expect(defaultReheatSeconds(4)).toBe(300)
  })
  it('is capped at 10 minutes', () => {
    expect(defaultReheatSeconds(9)).toBe(600)
    expect(defaultReheatSeconds(40)).toBe(600)
  })
  it('falls back to 2 minutes when the portions are not a usable number', () => {
    expect(defaultReheatSeconds(0)).toBe(120)
    expect(defaultReheatSeconds(-3)).toBe(120)
    expect(defaultReheatSeconds(Number.NaN)).toBe(120)
  })
  it('rounds fractional portions up (1.5 portions heat like 2)', () => {
    expect(defaultReheatSeconds(1.5)).toBe(180)
  })
})

describe('adjustReheatSeconds', () => {
  it('moves by the delta', () => {
    expect(adjustReheatSeconds(180, 30)).toBe(210)
    expect(adjustReheatSeconds(180, -30)).toBe(150)
  })
  it('stays within 30 seconds and 30 minutes', () => {
    expect(adjustReheatSeconds(40, -30)).toBe(30)
    expect(adjustReheatSeconds(30, -30)).toBe(30)
    expect(adjustReheatSeconds(1790, 30)).toBe(1800)
    expect(adjustReheatSeconds(1800, 30)).toBe(1800)
  })
})

describe('reheatTimerOf', () => {
  const scope = 'meal:2026-11-10/2'
  it('finds the free timer labelled Reheat in the scope, in any state', () => {
    expect(reheatTimerOf([timer()], scope)?.id).toBe(1)
    expect(reheatTimerOf([timer({ state: 'paused' })], scope)?.id).toBe(1)
    expect(reheatTimerOf([timer({ state: 'finished' })], scope)?.id).toBe(1)
  })
  it('ignores other scopes, other labels and Step timers', () => {
    expect(reheatTimerOf([timer({ scope: 'meal:2026-11-10/3' })], scope)).toBeNull()
    expect(reheatTimerOf([timer({ label: 'Eggs' })], scope)).toBeNull()
    expect(reheatTimerOf([timer({ step: 2 })], scope)).toBeNull()
    expect(reheatTimerOf([timer({ scope: null })], scope)).toBeNull()
    expect(reheatTimerOf([], scope)).toBeNull()
  })
})

describe('cookReheatPath', () => {
  it('is /cook/reheat/<date>/<slot>', () => {
    expect(cookReheatPath({ date: '2026-11-10', mealSlotId: 2 })).toBe('/cook/reheat/2026-11-10/2')
  })
})
