import { describe, expect, it } from 'vitest'
import type { AdvanceItem } from '../types'
import { advanceLine, advanceSummary, formatLeadTime } from './advance'

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

// B9-40 (PC-03): after the first Step the Advance Steps collapse to one info line.

describe('advanceLine (the one info line on a Step after the first)', () => {
  const adv = (over: Partial<AdvanceItem> = {}): AdvanceItem => ({ step: 0, text: 'Marinate the chicken overnight', leadTimeMinutes: 480, done: true, doneAt: '2026-11-09T08:00:00Z', warning: false, ...over })
  it('one done Advance Step names itself', () => {
    expect(advanceLine({ done: [adv()], pending: [] })).toBe('Advance Step done: Marinate the chicken overnight')
  })
  it('several done Advance Steps are counted', () => {
    expect(advanceLine({ done: [adv(), adv({ step: 2 })], pending: [] })).toBe('2 Advance Steps done')
  })
  it('anything still to do is what the line says (the count is the chip\'s, "1 Advance Step to do")', () => {
    expect(advanceLine({ done: [adv()], pending: [adv({ done: false, doneAt: null, step: 3 })] })).toBe('1 Advance Step to do')
    expect(advanceLine({ done: [], pending: [adv({ done: false, step: 3 }), adv({ done: false, step: 4 })] })).toBe('2 Advance Steps to do')
  })
  it('nothing: no line', () => {
    expect(advanceLine({ done: [], pending: [] })).toBe('')
  })
})
