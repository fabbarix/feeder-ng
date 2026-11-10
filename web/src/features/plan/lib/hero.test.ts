import { describe, expect, it } from 'vitest'
import { meal, slot } from '../test-utils'
import { heroCookLabel, heroDayOverline, heroOverline, heroPhase, heroSelection, heroStartBy } from './hero'

describe('heroPhase', () => {
  const s = slot({ at: '2026-11-10T19:30:00Z', time: '19:30' })
  it('is upcoming before the slot time and awaiting from it', () => {
    expect(heroPhase(s, new Date('2026-11-10T18:00:00Z'))).toBe('upcoming')
    expect(heroPhase(s, new Date('2026-11-10T19:29:59Z'))).toBe('upcoming')
    expect(heroPhase(s, new Date('2026-11-10T19:30:00Z'))).toBe('awaiting')
    expect(heroPhase(s, new Date('2026-11-10T21:00:00Z'))).toBe('awaiting')
  })
})

describe('hero text', () => {
  it('the overline is the Meal Slot and its time in capitals', () => {
    expect(heroOverline(slot({ name: 'Dinner', time: '19:30' }))).toBe('DINNER · 19:30')
    expect(heroOverline(slot({ name: 'Lunch', time: '12:30' }))).toBe('LUNCH · 12:30')
  })

  it('the Cook label carries the duration when known', () => {
    expect(heroCookLabel(meal({ cookMinutes: 45 }))).toBe('Cook · 45 min')
    expect(heroCookLabel(meal({ cookMinutes: 90 }))).toBe('Cook · 1 h 30 min')
    expect(heroCookLabel(meal())).toBe('Cook')
  })

  it('start by only when the meal knows it', () => {
    expect(heroStartBy(meal({ startBy: '18:45' }))).toBe('start 18:45')
    expect(heroStartBy(meal())).toBeNull()
  })
})

// N3: the Today hero shows today's next unresolved Planned Meal; otherwise tomorrow's first, labelled; Cook only for a
// fresh meal due today; a meal served from a Leftover shows "Leftover from <day>" and no Cook.
describe('heroSelection (N3)', () => {
  const today = '2026-11-10'
  const noon = new Date('2026-11-10T13:00:00Z')
  const at = (date: string, time: string) => `${date}T${time}:00Z`
  const fresh = (date: string, id: number, time: string, state: 'planned' | 'cooked' | 'skipped' = 'planned') =>
    slot({ date, mealSlotId: id, name: id === 1 ? 'Lunch' : 'Dinner', time, at: at(date, time), meal: meal({ date, mealSlotId: id, state }) })
  const served = (date: string, id: number, time: string) =>
    slot({
      date, mealSlotId: id, name: id === 1 ? 'Lunch' : 'Dinner', time, at: at(date, time),
      meal: meal({ date, mealSlotId: id, servedFromLeftover: { date: '2026-11-10', mealSlotId: 2, recipeName: 'Chicken & leek pie', leftoverId: 5 } }),
    })

  it("is today's next unresolved meal, with Cook, and no day label", () => {
    const sel = heroSelection([fresh(today, 2, '19:00'), fresh('2026-11-11', 1, '13:00')], noon, today)
    expect(sel).toMatchObject({ day: 'today', action: 'cook' })
    expect(sel?.slot.date).toBe(today)
    expect(heroDayOverline(sel!)).toBe('DINNER · 19:00')
  })

  it("falls to tomorrow's first meal, labelled, once today's meals are Cooked", () => {
    const slots = [fresh(today, 1, '12:00', 'cooked'), fresh(today, 2, '19:00', 'cooked'), fresh('2026-11-11', 2, '19:00'), fresh('2026-11-11', 1, '13:00')]
    const sel = heroSelection(slots, noon, today)
    expect(sel?.slot).toMatchObject({ date: '2026-11-11', mealSlotId: 1 })
    expect(sel?.day).toBe('tomorrow')
    expect(heroDayOverline(sel!)).toBe('TOMORROW · LUNCH')
  })

  it('offers no Cook for a fresh meal that is not due today', () => {
    const sel = heroSelection([fresh(today, 1, '12:00', 'cooked'), fresh('2026-11-11', 2, '19:00')], noon, today)
    expect(sel?.action).toBe('none')
  })

  it('a Leftover-served meal never offers Cook: tomorrow keeps the Leftover chip, today offers Reheat (R12)', () => {
    const tomorrow = heroSelection([served('2026-11-11', 1, '13:00')], noon, today)
    expect(tomorrow).toMatchObject({ day: 'tomorrow', action: 'leftover' })
    const todays = heroSelection([served(today, 2, '19:00')], noon, today)
    expect(todays).toMatchObject({ day: 'today', action: 'reheat' })
  })

  it('keeps an unconfirmed meal of today as the hero for two hours after its slot, then moves on', () => {
    const slots = [fresh(today, 2, '19:00'), fresh('2026-11-11', 1, '13:00')]
    expect(heroSelection(slots, new Date('2026-11-10T20:30:00Z'), today)?.slot.date).toBe(today)
    expect(heroSelection(slots, new Date('2026-11-10T21:00:00Z'), today)?.slot.date).toBe('2026-11-11')
  })

  it('a meal further out is labelled with its weekday and offers no Cook', () => {
    const sel = heroSelection([fresh('2026-11-13', 1, '13:00')], noon, today)
    expect(sel).toMatchObject({ day: 'later', action: 'none' })
    expect(heroDayOverline(sel!)).toBe('FRI · LUNCH')
  })

  it('is null when nothing is left', () => {
    expect(heroSelection([], noon, today)).toBeNull()
    expect(heroSelection([fresh(today, 2, '19:00', 'skipped')], noon, today)).toBeNull()
  })
})
