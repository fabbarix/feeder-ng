import { describe, expect, it } from 'vitest'
import { mayResolve } from './resolve'

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
