// B5-F1 (ADR 0014, beta5-plan 2.2): Guests in the Who's eating sheet: the clamp, the portions preview, and the emptied-date rule (U1).
import { describe, expect, it } from 'vitest'
import { anna, marco, sam } from '../components/fixtures'
import type { AttendanceEntry } from '../types'
import { clampGuests, emptiesDate, guestsLabel, MAX_GUESTS, portionsPreview, portionsPreviewText, savingEmptiesDate } from './dateAttendance'

const all: AttendanceEntry[] = [1, 2, 3].map((memberId) => ({ memberId, portionFactorOverride: null }))
const members = [anna, marco, sam] // factors 1, 1, 0.5

describe('clampGuests', () => {
  it('keeps 0 to 20, whole', () => {
    expect(MAX_GUESTS).toBe(20)
    expect(clampGuests(3)).toBe(3)
    expect(clampGuests(-2)).toBe(0)
    expect(clampGuests(25)).toBe(20)
    expect(clampGuests(2.6)).toBe(3)
    expect(clampGuests(Number.NaN)).toBe(0)
  })
})

describe('portionsPreview', () => {
  it('is the Members\' effective Portion Factors plus one portion per Guest', () => {
    expect(portionsPreview(members, all, 0)).toBe(2.5)
    expect(portionsPreview(members, all, 2)).toBe(4.5)
  })

  it('uses a date\'s Portion Factor override', () => {
    expect(portionsPreview(members, [{ memberId: 3, portionFactorOverride: 1 }], 1)).toBe(2)
  })

  it('Guests alone are portions too', () => {
    expect(portionsPreview(members, [], 2)).toBe(2)
  })

  it('reads as "6 portions of each Course"', () => {
    expect(portionsPreviewText(6)).toBe('6 portions of each Course')
    expect(portionsPreviewText(1)).toBe('1 portion of each Course')
    expect(portionsPreviewText(4.5)).toBe('4.5 portions of each Course')
  })
})

describe('emptiesDate (U1)', () => {
  it('no Member and no Guest', () => {
    expect(emptiesDate([], 0)).toBe(true)
    expect(emptiesDate([], 2)).toBe(false)
    expect(emptiesDate(all, 0)).toBe(false)
  })
})

describe('savingEmptiesDate', () => {
  const usual = all
  it('Members emptied with no Guest', () => {
    expect(savingEmptiesDate({ attendance: [] }, { attendance: all, guests: 0 }, usual)).toBe(true)
  })

  it('the stored Guests keep a date with no Member served', () => {
    expect(savingEmptiesDate({ attendance: [] }, { attendance: all, guests: 2 }, usual)).toBe(false)
  })

  it('taking the Guests off a date with no Member empties it', () => {
    expect(savingEmptiesDate({ guests: 0 }, { attendance: [], guests: 2 }, usual)).toBe(true)
  })

  it('a save that sends neither Members nor Guests (Courses only) never empties, even when the usual Attendance is empty', () => {
    expect(savingEmptiesDate({}, undefined, [])).toBe(false)
    expect(savingEmptiesDate({}, { attendance: [], guests: 0 }, [])).toBe(false)
  })

  it('Members kept, or Guests added, do not empty', () => {
    expect(savingEmptiesDate({ attendance: all }, { attendance: all, guests: 0 }, usual)).toBe(false)
    expect(savingEmptiesDate({ guests: 3 }, { attendance: [], guests: 0 }, usual)).toBe(false)
  })
})

describe('guestsLabel', () => {
  it('counts', () => {
    expect(guestsLabel(0)).toBe('')
    expect(guestsLabel(1)).toBe('1 Guest')
    expect(guestsLabel(2)).toBe('2 Guests')
  })
})
