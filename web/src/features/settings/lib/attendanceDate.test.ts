import { describe, expect, it } from 'vitest'
import { dateProblem } from './attendanceDate'

describe('dateProblem', () => {
  it('accepts a date on the weekday', () => expect(dateProblem(4, '2026-11-12')).toBeNull())
  it('names the weekday it should be', () => expect(dateProblem(4, '2026-11-11')).toBe('2026-11-11 is not a Thursday'))
  it('rejects a date that does not exist', () => expect(dateProblem(4, '2026-02-30')).toMatch(/valid date/))
})
