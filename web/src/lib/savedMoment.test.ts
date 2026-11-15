// B9-49 (RES-07): the moment the offline banner names, in the Household's zone (never the device's when the zone is known):
// "04:30" for today in that zone, "Sat 18:05" (weekday, then the time) for an earlier day. 24 h, zero padded, no AM/PM.
// Plain TypeScript (lib/savedMoment.ts). The stage-1 defect: the banner said 08:30 (device, UTC-6) when the household time was 04:30 the next day (UTC+14).
import { describe, expect, it } from 'vitest'
import { savedMoment } from './savedMoment'

// 2026-11-10 14:30 UTC is 2026-11-11 04:30 in Pacific/Kiritimati (UTC+14) and 2026-11-10 08:30 in America/Chicago (UTC-6).
const at = new Date(Date.UTC(2026, 10, 10, 14, 30))

describe('savedMoment', () => {
  it('is the time in the Household zone, not the device zone (04:30 at UTC+14 where a device at UTC-6 reads 08:30)', () => {
    expect(savedMoment(at, new Date(Date.UTC(2026, 10, 10, 15, 0)), 'Pacific/Kiritimati')).toBe('04:30')
    expect(savedMoment(at, new Date(Date.UTC(2026, 10, 10, 15, 0)), 'America/Chicago')).toBe('08:30')
  })

  it('pads and is 24 h (07:05, 23:59, never AM or PM)', () => {
    const now = new Date(Date.UTC(2026, 10, 10, 23, 59))
    expect(savedMoment(new Date(Date.UTC(2026, 10, 10, 7, 5)), now, 'UTC')).toBe('07:05')
    expect(savedMoment(new Date(Date.UTC(2026, 10, 10, 23, 59)), now, 'UTC')).toBe('23:59')
  })

  it('an earlier day in the Household zone gets the weekday: "Sat 18:05"', () => {
    const saturday = new Date(Date.UTC(2026, 10, 14, 18, 5)) // Sat 2026-11-14
    expect(savedMoment(saturday, new Date(Date.UTC(2026, 10, 16, 9, 0)), 'UTC')).toBe('Sat 18:05')
  })

  it('"today" is the Household\'s day: the same UTC day can be yesterday there', () => {
    const now = new Date(Date.UTC(2026, 10, 11, 10, 0)) // 2026-11-12 00:00 in Kiritimati
    expect(savedMoment(at, now, 'Pacific/Kiritimati')).toBe('Wed 04:30')
    expect(savedMoment(at, now, 'UTC')).toBe('Tue 14:30') // 2026-11-10 14:30 in UTC, and now is the 11th there
  })

  it('without a usable zone it falls back to the device clock (the shell may have never seen /api/me)', () => {
    const local = new Date(2026, 10, 10, 9, 7)
    const now = new Date(2026, 10, 10, 12, 0)
    expect(savedMoment(local, now, null)).toBe('09:07')
    expect(savedMoment(local, now, undefined)).toBe('09:07')
    expect(savedMoment(local, now, 'Not/AZone')).toBe('09:07')
  })
})
