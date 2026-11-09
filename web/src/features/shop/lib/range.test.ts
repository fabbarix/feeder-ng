import { describe, expect, it } from 'vitest'
import { dayLabel, describeRange, rangeChoices } from './range'

describe('dayLabel', () => {
  it('names today and tomorrow, then the weekday and day of month', () => {
    expect(dayLabel('2026-11-09', '2026-11-09')).toBe('Today')
    expect(dayLabel('2026-11-10', '2026-11-09')).toBe('Tomorrow')
    expect(dayLabel('2026-11-12', '2026-11-09')).toBe('Thu 12')
    expect(dayLabel('2026-12-01', '2026-11-09')).toBe('Tue 1')
  })
})

describe('describeRange', () => {
  it('reads as "Today" or "Until ..."', () => {
    expect(describeRange('2026-11-09', '2026-11-09')).toBe('Today')
    expect(describeRange('2026-11-10', '2026-11-09')).toBe('Until tomorrow')
    expect(describeRange('2026-11-15', '2026-11-09')).toBe('Until Sun 15')
  })
})

describe('rangeChoices', () => {
  it('offers every day from today up to the Planning Horizon', () => {
    const c = rangeChoices('2026-11-09', '2026-11-15')
    expect(c).toHaveLength(7)
    expect(c[0]).toEqual({ to: '2026-11-09', label: 'Today' })
    expect(c[1]).toEqual({ to: '2026-11-10', label: 'Tomorrow' })
    expect(c[6]).toEqual({ to: '2026-11-15', label: 'Sun 15' })
  })

  it('is a single choice for a one-day horizon, and never empty', () => {
    expect(rangeChoices('2026-11-09', '2026-11-09')).toEqual([{ to: '2026-11-09', label: 'Today' }])
    expect(rangeChoices('2026-11-09', '2026-11-01')).toEqual([{ to: '2026-11-09', label: 'Today' }])
  })

  it('stops at 14 days for long horizons', () => {
    const c = rangeChoices('2026-11-09', '2026-12-31')
    expect(c).toHaveLength(14)
    expect(c[13]?.to).toBe('2026-11-22')
  })
})
