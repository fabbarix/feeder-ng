// B5-F1: Reset to usual Attendance also drops the Guests, so Guests alone enable it.
import { describe, expect, it } from 'vitest'
import { hasDateOverride } from './dateCourses'

describe('hasDateOverride with Guests', () => {
  it('Guests on a date follow the reset', () => {
    expect(hasDateOverride({ isOverride: false, guests: 2 })).toBe(true)
    expect(hasDateOverride({ isOverride: false, guests: 0 })).toBe(false)
    expect(hasDateOverride({ isOverride: false })).toBe(false)
  })
})
