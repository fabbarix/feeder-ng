import { describe, expect, it } from 'vitest'
import { elapsedSince } from './requests'

const now = new Date('2026-11-10T12:00:00Z')

describe('elapsedSince', () => {
  it('is now under a minute, and for an unreadable or future instant', () => {
    expect(elapsedSince('2026-11-10T11:59:30Z', now)).toEqual({ unit: 'now' })
    expect(elapsedSince('nonsense', now)).toEqual({ unit: 'now' })
    expect(elapsedSince('2026-11-11T12:00:00Z', now)).toEqual({ unit: 'now' })
  })
  it('counts whole minutes, hours and days, rounding down', () => {
    expect(elapsedSince('2026-11-10T11:15:00Z', now)).toEqual({ unit: 'minutes', n: 45 })
    expect(elapsedSince('2026-11-10T11:00:00Z', now)).toEqual({ unit: 'hours', n: 1 })
    expect(elapsedSince('2026-11-09T13:00:00Z', now)).toEqual({ unit: 'hours', n: 23 })
    expect(elapsedSince('2026-11-09T12:00:00Z', now)).toEqual({ unit: 'days', n: 1 })
  })
})
