import { describe, expect, it } from 'vitest'
import { compactAction, mayCook, mayResolve } from './resolve'

describe('mayResolve (B10)', () => {
  it('is true for today and for the past', () => {
    expect(mayResolve('2026-11-09', '2026-11-09')).toBe(true)
    expect(mayResolve('2026-11-08', '2026-11-09')).toBe(true)
    expect(mayResolve('2025-12-31', '2026-01-01')).toBe(true)
  })

  it('is false for any later date, even tomorrow', () => {
    expect(mayResolve('2026-11-10', '2026-11-09')).toBe(false)
    expect(mayResolve('2027-01-01', '2026-12-31')).toBe(false)
  })

  it('is false for something that is not a date', () => {
    expect(mayResolve('', '2026-11-09')).toBe(false)
    expect(mayResolve('tomorrow', '2026-11-09')).toBe(false)
  })
})

describe('mayCook (B2: Cook Mode only for today)', () => {
  it('is true for today only', () => {
    expect(mayCook('2026-11-09', '2026-11-09')).toBe(true)
    expect(mayCook('2026-11-08', '2026-11-09')).toBe(false)
    expect(mayCook('2026-11-10', '2026-11-09')).toBe(false)
  })

  it('is false for something that is not a date', () => {
    expect(mayCook('', '2026-11-09')).toBe(false)
    expect(mayCook('2026-11-09', '')).toBe(false)
  })
})

describe('compactAction (7-column week: one icon action per Planned Meal)', () => {
  it('Cook on today, Swap on a future date, nothing on a past date or a non-date', () => {
    expect(compactAction('2026-11-10', '2026-11-10')).toBe('cook')
    expect(compactAction('2026-11-11', '2026-11-10')).toBe('swap')
    expect(compactAction('2026-11-09', '2026-11-10')).toBeNull()
    expect(compactAction('soon', '2026-11-10')).toBeNull()
  })
})
