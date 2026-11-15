// B9-46 (SET-16): Away on the Members list and in the Member sheet. Today is Sun 15 Nov 2026.
import { describe, expect, it } from 'vitest'
import type { Away, AwaySlotRef } from '../../plan/types'
import { awayMeta, awayRow, awayRowName } from './away'

const TODAY = '2026-11-15'
const away = (over: Partial<Away> = {}): Away => ({
  id: 1, memberId: 2, memberName: 'Ben', from: '2026-11-20', fromMealSlotId: null, through: '2026-11-27', throughMealSlotId: null, started: false, ...over,
})
/** Breakfast, Lunch and Dinner on every weekday: ids are weekday * 10 + 1, 2, 3 (Thu: 41, 42, 43). */
const slots: AwaySlotRef[] = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
  { id: weekday * 10 + 1, weekday, name: 'Breakfast', time: '08:30' },
  { id: weekday * 10 + 2, weekday, name: 'Lunch', time: '13:00' },
  { id: weekday * 10 + 3, weekday, name: 'Dinner', time: '19:00' },
])

describe('awayMeta (the Members list)', () => {
  it('names the next Away by its days', () => {
    expect(awayMeta([away()], TODAY)).toBe('Away 20–27 Nov')
    expect(awayMeta([away({ through: '2026-11-20' })], TODAY)).toBe('Away 20 Nov')
    expect(awayMeta([away({ from: '2026-11-27', through: '2026-12-01' })], TODAY)).toBe('Away 27 Nov – 1 Dec')
  })
  it('a running Away says until when', () => {
    expect(awayMeta([away({ from: '2026-11-13', through: '2026-11-16', started: true })], TODAY)).toBe('Away until Mon 16 Nov')
    expect(awayMeta([away({ from: '2026-11-13', through: '2026-11-15', started: true })], TODAY)).toBe('Away until Sun 15 Nov')
  })
  it('an Away with no last day yet says from when', () => {
    expect(awayMeta([away({ from: '2026-12-01', through: null })], TODAY)).toBe('Away from Tue 1 Dec')
    expect(awayMeta([away({ from: '2026-11-10', through: null, started: true })], TODAY)).toBe('Away from Tue 10 Nov')
  })
  it('more than one: only the next is named, with "+1 more"', () => {
    expect(awayMeta([away(), away({ id: 2, from: '2026-12-01', through: null })], TODAY)).toBe('Away 20–27 Nov · +1 more')
    expect(awayMeta([away(), away({ id: 2 }), away({ id: 3 })], TODAY)).toBe('Away 20–27 Nov · +2 more')
  })
  it('past Aways never show', () => {
    const past = away({ id: 5, from: '2026-11-01', through: '2026-11-12', started: true })
    expect(awayMeta([past], TODAY)).toBeNull()
    expect(awayMeta([past, away()], TODAY)).toBe('Away 20–27 Nov')
  })
  it('no Away, no line', () => {
    expect(awayMeta([], TODAY)).toBeNull()
  })
})

describe('awayRow (the Member sheet: key, state, detail)', () => {
  it('a coming Away: its range, in how many days, and how many Meal Slots', () => {
    expect(awayRow(away({ from: '2026-11-19', through: '2026-11-26' }), TODAY, slots)).toEqual({
      title: 'Thu 19 – Thu 26 Nov',
      state: 'in 4 days',
      detail: '24 Meal Slots · whole days',
    })
  })
  it('a first Meal Slot that is not the first of the day is named', () => {
    expect(awayRow(away({ from: '2026-11-19', fromMealSlotId: 43, through: '2026-11-26' }), TODAY, slots).detail).toBe('From Dinner · 22 Meal Slots')
  })
  it('a last Meal Slot that is not the last of the day is named, and both can be', () => {
    expect(awayRow(away({ from: '2026-11-19', through: '2026-11-20', throughMealSlotId: 52 }), TODAY, slots).detail).toBe('Through Lunch · 5 Meal Slots')
    expect(awayRow(away({ from: '2026-11-19', fromMealSlotId: 43, through: '2026-11-20', throughMealSlotId: 52 }), TODAY, slots).detail).toBe('From Dinner through Lunch · 3 Meal Slots')
    expect(awayRow(away({ from: '2026-11-19', fromMealSlotId: 43, through: '2026-11-19', throughMealSlotId: 43 }), TODAY, slots).detail).toBe('From Dinner through Dinner · 1 Meal Slot')
  })
  it('no last day yet', () => {
    expect(awayRow(away({ from: '2026-12-01', through: null }), TODAY, slots)).toEqual({ title: 'From Tue 1 Dec', state: 'in 16 days', detail: 'No last day yet' })
    expect(awayRow(away({ from: '2026-12-01', fromMealSlotId: 23, through: null }), TODAY, slots).detail).toBe('From Dinner · No last day yet')
  })
  it('a running Away is "now"; one that starts today but has not started is "today"; tomorrow is "in 1 day"', () => {
    expect(awayRow(away({ from: '2026-11-13', through: '2026-11-16', started: true }), TODAY, slots).state).toBe('now')
    expect(awayRow(away({ from: '2026-11-15', through: '2026-11-16' }), TODAY, slots).state).toBe('today')
    expect(awayRow(away({ from: '2026-11-16', through: '2026-11-16' }), TODAY, slots).state).toBe('in 1 day')
  })
  it('names the row "Away <range>, <state>, <detail>"', () => {
    expect(awayRowName({ title: 'Thu 19 – Thu 26 Nov', state: 'in 4 days', detail: '24 Meal Slots · whole days' })).toBe('Away Thu 19 – Thu 26 Nov, in 4 days, 24 Meal Slots · whole days')
  })
})
