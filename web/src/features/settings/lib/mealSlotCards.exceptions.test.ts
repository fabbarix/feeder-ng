// B5-F1 (ADR 0014): "Dates that differ" gets its source: the plan's slots with their own time, Not served or Guests.
import { describe, expect, it } from 'vitest'
import { anna, marco } from '../components/fixtures'
import type { PlanDateSlot } from '../types'
import { datePartText, datesThatDiffer, exceptionsFromPlan } from './mealSlotCards'

const row = (over: Partial<PlanDateSlot> = {}): PlanDateSlot => ({ date: '2026-11-12', mealSlotId: 4, name: 'Dinner', time: '19:30', usualTime: '19:30', notServed: false, guests: 0, ...over })

describe('exceptionsFromPlan', () => {
  it('a slot on its usual time, served, with no Guests is no exception', () => {
    expect(exceptionsFromPlan([row()])).toEqual([])
    expect(exceptionsFromPlan([row({ usualTime: undefined, notServed: undefined, guests: undefined })])).toEqual([])
  })

  it('a date with its own time names both times', () => {
    expect(exceptionsFromPlan([row({ time: '20:15' })])).toEqual([{ date: '2026-11-12', slotId: 4, slotName: 'Dinner', time: '20:15', usualTime: '19:30' }])
  })

  it('a Not served date', () => {
    expect(exceptionsFromPlan([row({ notServed: true })])).toEqual([{ date: '2026-11-12', slotId: 4, slotName: 'Dinner', notServed: true }])
  })

  it('Guests', () => {
    expect(exceptionsFromPlan([row({ guests: 2 })])).toEqual([{ date: '2026-11-12', slotId: 4, slotName: 'Dinner', guests: 2 }])
  })

  it('every kind at once on one slot is one exception', () => {
    const [e] = exceptionsFromPlan([row({ time: '20:15', guests: 3 })])
    expect(e).toMatchObject({ time: '20:15', usualTime: '19:30', guests: 3 })
  })
})

describe('datesThatDiffer with Guests', () => {
  const opts = { today: '2026-11-09', locale: 'en' }
  const ex = (over: object) => ({ date: '2026-11-12', slotId: 4, slotName: 'Dinner', ...over })

  it('Guests are a part, after the time', () => {
    const [r] = datesThatDiffer([ex({ time: '20:15', usualTime: '19:30', guests: 2 })], opts)
    expect(r!.parts).toEqual([{ kind: 'time', time: '20:15', usualTime: '19:30' }, { kind: 'guests', guests: 2 }])
  })

  it('a date with only Guests is a row; no Guests and nothing else is not', () => {
    expect(datesThatDiffer([ex({ guests: 2 })], opts)).toHaveLength(1)
    expect(datesThatDiffer([ex({ guests: 0 })], opts)).toEqual([])
  })

  it('Not served stays the only part (Guests are kept but not shown while it is not served)', () => {
    const [r] = datesThatDiffer([ex({ notServed: true, guests: 2 })], opts)
    expect(r!.parts).toEqual([{ kind: 'notServed' }])
  })

  it('the Guests part reads "2 Guests"', () => {
    expect(datePartText({ kind: 'guests', guests: 2 }, [anna, marco])).toBe('2 Guests')
    expect(datePartText({ kind: 'guests', guests: 1 }, [anna, marco])).toBe('1 Guest')
  })
})
