import { describe, expect, it } from 'vitest'
import { moveIso } from './calendar'

describe('moveIso (keyboard navigation of the calendar grid)', () => {
  it('arrows move by a day or a week, crossing month ends', () => {
    expect(moveIso('2026-11-10', 'ArrowRight')).toBe('2026-11-11')
    expect(moveIso('2026-11-10', 'ArrowLeft')).toBe('2026-11-09')
    expect(moveIso('2026-11-10', 'ArrowDown')).toBe('2026-11-17')
    expect(moveIso('2026-11-03', 'ArrowUp')).toBe('2026-10-27')
    expect(moveIso('2026-11-30', 'ArrowRight')).toBe('2026-12-01')
  })
  it('PageUp and PageDown move by a month, clamping the day', () => {
    expect(moveIso('2027-01-31', 'PageDown')).toBe('2027-02-28')
    expect(moveIso('2027-03-31', 'PageUp')).toBe('2027-02-28')
  })
  it('other keys do not move', () => {
    expect(moveIso('2026-11-10', 'Enter')).toBeNull()
  })
})
