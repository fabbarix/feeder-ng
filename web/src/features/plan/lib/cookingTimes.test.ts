// B9-51 (PC-14, A2): the pure part of the "Cooking times" tile of Planning rules.
import { describe, expect, it } from 'vitest'
import { canStartAt, cookingTimesBody, cookingTimesError, cookingTimesOf, DEFAULT_EARLIEST_START, DEFAULT_LATEST_START, startExample, type CookingTimes } from './cookingTimes'

const t = (earliestStart: string | null, latestStart: string | null): CookingTimes => ({ earliestStart, latestStart })

describe('defaults', () => {
  it('are 06:30 and 22:00 (decision PC 5 and amendment A2)', () => {
    expect(DEFAULT_EARLIEST_START).toBe('06:30')
    expect(DEFAULT_LATEST_START).toBe('22:00')
  })
})

describe('cookingTimesOf (the two fields of GET /api/household/settings)', () => {
  it('takes the stored times', () => expect(cookingTimesOf({ earliestStart: '07:15', latestStart: '21:30' })).toEqual(t('07:15', '21:30')))
  it('null is Off, for each field on its own', () => {
    expect(cookingTimesOf({ earliestStart: null, latestStart: '22:00' })).toEqual(t(null, '22:00'))
    expect(cookingTimesOf({ earliestStart: '06:30', latestStart: null })).toEqual(t('06:30', null))
  })
  it('a payload from an older server (the fields absent) reads as the defaults, not as Off', () => {
    expect(cookingTimesOf({})).toEqual(t('06:30', '22:00'))
  })
})

describe('cookingTimesError (client check before the save; the server says the same with 422 on latestStart)', () => {
  it('a Latest start later than the Earliest start is fine', () => expect(cookingTimesError(t('06:30', '22:00'))).toEqual({}))
  it('a Latest start equal to or before the Earliest start is refused, at the Latest start field', () => {
    expect(cookingTimesError(t('07:00', '07:00'))).toEqual({ latestStart: 'Latest start must be later than Earliest start.' })
    expect(cookingTimesError(t('08:00', '07:30'))).toEqual({ latestStart: 'Latest start must be later than Earliest start.' })
  })
  it('Off on either side is never an error', () => {
    expect(cookingTimesError(t(null, '03:00'))).toEqual({})
    expect(cookingTimesError(t('23:00', null))).toEqual({})
    expect(cookingTimesError(t(null, null))).toEqual({})
  })
})

describe('cookingTimesBody (PUT /api/household/settings needs the whole settings: the rest is sent back unchanged)', () => {
  const stored = { timeZone: 'Europe/Rome', timeZoneConfigured: true, planningHorizonDays: 7, currency: 'EUR', quietHours: { start: '22:00', end: '07:00' }, earliestStart: '06:30', latestStart: '22:00' }
  it('replaces the two fields and keeps every other one, except the server-owned timeZoneConfigured (the Household form leaves it out too)', () => {
    const { timeZoneConfigured: _owned, ...rest } = stored
    expect(cookingTimesBody(stored, t('07:00', null))).toEqual({ ...rest, earliestStart: '07:00', latestStart: null })
  })
  it('does not change its input', () => {
    const copy = JSON.parse(JSON.stringify(stored))
    cookingTimesBody(stored, t('07:00', '21:00'))
    expect(stored).toEqual(copy)
  })
})

describe('canStartAt (the planner rule of PC-14 and A2, as the Go planner reads it: both ends allowed)', () => {
  it('Latest start Off: the start must be on the day of the meal, at or after the Earliest start', () => {
    expect(canStartAt('13:00', 360, t('06:30', null))).toBe(true) // 07:00
    expect(canStartAt('12:30', 360, t('06:30', null))).toBe(true) // 06:30 exactly
    expect(canStartAt('08:30', 360, t('06:30', null))).toBe(false) // 02:30
    expect(canStartAt('08:30', 600, t('06:30', null))).toBe(false) // the evening before: not allowed without a Latest start
  })
  it('Latest start on: the start may be on an earlier day if its time of day is from Earliest start to Latest start', () => {
    expect(canStartAt('08:30', 660, t('06:30', '22:00'))).toBe(true) // 21:30 the day before
    expect(canStartAt('08:30', 600, t('06:30', '22:00'))).toBe(false) // 22:30 the day before: quiet hours
    expect(canStartAt('08:30', 360, t('06:30', '22:00'))).toBe(false) // 02:30: quiet hours
    expect(canStartAt('19:00', 60, t('06:30', '22:00'))).toBe(true)
  })
  it('both ends are allowed', () => {
    expect(canStartAt('22:00', 0, t('06:30', '22:00'))).toBe(true)
    expect(canStartAt('12:30', 360, t('06:30', '22:00'))).toBe(true)
  })
  it('Earliest start Off: nothing is too early, whatever the Latest start', () => {
    expect(canStartAt('08:30', 360, t(null, null))).toBe(true)
    expect(canStartAt('08:30', 360, t(null, '22:00'))).toBe(true)
  })
})

describe('startExample (the line under the Earliest start, from the longest Recipe)', () => {
  const stew = { name: 'Slow cooker beef and barley stew', totalMinutes: 360 }
  const slots = [
    { name: 'Dinner', time: '19:00' },
    { name: 'Breakfast', time: '08:30' },
    { name: 'Lunch', time: '13:00' },
  ]
  it('names the longest Recipe, the first Meal Slot it can be planned for and the ones it cannot (the mock of PC-14)', () => {
    expect(startExample([{ name: 'Omelette', totalMinutes: 10 }, stew], slots, t('06:30', null))).toBe(
      'Slow cooker beef and barley stew (6 h) can be planned for Lunch at 13:00 or later, not for Breakfast.',
    )
  })
  it('names two Meal Slots it cannot be planned for with "or"', () => {
    expect(startExample([stew], [...slots, { name: 'Brunch', time: '10:00' }], t('06:30', null))).toBe(
      'Slow cooker beef and barley stew (6 h) can be planned for Lunch at 13:00 or later, not for Breakfast or Brunch.',
    )
  })
  it('a start the evening before counts when the Latest start allows it', () => {
    const pork = { name: 'Overnight pulled pork', totalMinutes: 660 }
    const twoSlots = [
      { name: 'Dinner', time: '19:00' },
      { name: 'Breakfast', time: '08:30' },
    ]
    expect(startExample([pork], twoSlots, t('06:30', '22:00'))).toBe('Overnight pulled pork (11 h) can be planned for any Meal Slot.')
    expect(startExample([pork], twoSlots, t('06:30', null))).toBe('Overnight pulled pork (11 h) can be planned for Dinner at 19:00 or later, not for Breakfast.')
  })
  it('when the Meal Slots it can be planned for are not all the later ones, it lists them, in the order of the day', () => {
    const pork = { name: 'Overnight pulled pork', totalMinutes: 660 }
    // Breakfast 08:30 starts 21:30 the evening before (allowed), Lunch 13:00 starts 02:00 (quiet), Dinner 19:00 starts 08:00 (allowed).
    expect(startExample([pork], slots, t('06:30', '22:00'))).toBe('Overnight pulled pork (11 h) can be planned for Breakfast or Dinner, not for Lunch.')
  })
  it('says so when it fits every Meal Slot, and when it fits none', () => {
    expect(startExample([{ name: 'Pasta', totalMinutes: 25 }], slots, t('06:30', '22:00'))).toBe('Pasta (25 min) can be planned for any Meal Slot.')
    expect(startExample([{ name: 'Cassoulet', totalMinutes: 1500 }], slots, t('06:30', null))).toBe("Cassoulet (25 h) can't be planned for any Meal Slot.")
  })
  it('Earliest start Off: nothing is too early', () => {
    expect(startExample([stew], slots, t(null, null))).toBe('Slow cooker beef and barley stew (6 h) can be planned for any Meal Slot.')
  })
  it('is null with no Recipe that has a total time, or with no Meal Slot', () => {
    expect(startExample([{ name: 'Soup' }], slots, t('06:30', null))).toBeNull()
    expect(startExample([], slots, t('06:30', null))).toBeNull()
    expect(startExample([stew], [], t('06:30', null))).toBeNull()
  })
  it('a Meal Slot that is served on several weekdays counts once', () => {
    const week = [...slots, { name: 'Lunch', time: '13:00' }, { name: 'Breakfast', time: '08:30' }]
    expect(startExample([stew], week, t('06:30', null))).toBe('Slow cooker beef and barley stew (6 h) can be planned for Lunch at 13:00 or later, not for Breakfast.')
  })
})
