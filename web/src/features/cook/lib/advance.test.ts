import { describe, expect, it } from 'vitest'
import type { AdvanceItem } from '../types'
import { advanceSummary, formatLeadTime } from './advance'

const item = (step: number, done: boolean): AdvanceItem => ({ step, text: `prep ${step}`, leadTimeMinutes: 60, done, doneAt: done ? '2026-11-09T08:00:00Z' : null, warning: !done })

describe('advanceSummary', () => {
  it('splits done from pending in Recipe order', () => {
    const s = advanceSummary([item(0, true), item(3, false), item(5, true), item(7, false)])
    expect(s.done.map((i) => i.step)).toEqual([0, 5])
    expect(s.pending.map((i) => i.step)).toEqual([3, 7])
  })
  it('handles none', () => {
    expect(advanceSummary([])).toEqual({ done: [], pending: [] })
  })
})

describe('formatLeadTime', () => {
  it.each([
    [30, '30 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [240, '4 h'],
    [1440, '1 day'],
    [2880, '2 days'],
    [1800, '1 day 6 h'],
  ])('%i minutes is %s', (minutes, text) => {
    expect(formatLeadTime(minutes)).toBe(text)
  })
})
