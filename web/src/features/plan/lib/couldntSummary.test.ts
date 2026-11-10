import { describe, expect, it } from 'vitest'
import type { PlanSlot } from '../types'
import { summarizeSlots } from './couldntSummary'

/** Tue 2026-11-10 .. Mon 2026-11-16 (a 7-day horizon); Dinner every day, Breakfast only Sat and Sun, Lunch Mon to Fri. */
const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']
function s(date: string, name: string, id: number): PlanSlot {
  return { date, mealSlotId: id, name, time: '19:00', at: `${date}T19:00:00Z`, portions: 2, meal: null, unfilled: null, rules: [] }
}
const dinners = days.map((d, i) => s(d, 'Dinner', 100 + i))
const breakfasts = ['2026-11-14', '2026-11-15'].map((d, i) => s(d, 'Breakfast', 200 + i))
const lunches = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16'].map((d, i) => s(d, 'Lunch', 300 + i))
const all = [...dinners, ...breakfasts, ...lunches]

describe('summarizeSlots', () => {
  it('every dinner this week, plus weekend breakfasts (the screenshot case)', () => {
    expect(summarizeSlots([...dinners, ...breakfasts], all)).toBe('Every dinner this week, plus weekend breakfasts')
  })

  it('one name, every day', () => expect(summarizeSlots(dinners, all)).toBe('Every dinner this week'))

  it('a name that only exists at the weekend reads as weekend, not every', () =>
    expect(summarizeSlots(breakfasts, all)).toBe('Weekend breakfasts'))

  it('a weekend that is only part of what exists reads as weekend', () => {
    const weekendDinners = [dinners[4]!, dinners[5]!]
    expect(summarizeSlots(weekendDinners, all)).toBe('Weekend dinners')
  })

  it('Monday to Friday of a name', () => {
    const weekdayDinners = [dinners[0]!, dinners[1]!, dinners[2]!, dinners[3]!, dinners[6]!]
    expect(summarizeSlots(weekdayDinners, all)).toBe('Weekday dinners')
  })

  it('up to three days are named', () => {
    expect(summarizeSlots([dinners[0]!, dinners[2]!], all)).toBe('Tuesday and Thursday dinners')
    expect(summarizeSlots([dinners[0]!, dinners[2]!, dinners[3]!], all)).toBe('Tuesday, Thursday and Friday dinners')
    expect(summarizeSlots([dinners[2]!], all)).toBe('Thursday dinner')
  })

  it('four or more scattered days are counted', () => {
    expect(summarizeSlots([dinners[0]!, dinners[1]!, dinners[2]!, dinners[4]!], all)).toBe('4 dinners')
  })

  it('the biggest part first, the rest after "plus", joined with "and"', () => {
    const text = summarizeSlots([...dinners, ...breakfasts, lunches[0]!], all)
    expect(text).toBe('Every dinner this week, plus weekend breakfasts and Tuesday lunch')
  })

  it('plurals of names ending in s, ch, sh or x take es; a name with several words keeps its words', () => {
    const brunch = [s('2026-11-14', 'Brunch', 1), s('2026-11-15', 'Brunch', 2)]
    expect(summarizeSlots([brunch[0]!], [...all, ...brunch])).toBe('Saturday brunch')
    expect(summarizeSlots(brunch, [...all, ...brunch])).toBe('Weekend brunches')
    const six = days.slice(0, 6).map((d, i) => s(d, 'Sunday lunch', 10 + i))
    expect(summarizeSlots(six.slice(2), [...all, ...six])).toBe('4 sunday lunches')
  })

  it('"Every" needs every slot of that name in the plan: three of seven dinners are not every dinner', () => {
    expect(summarizeSlots(dinners.slice(0, 3), all)).toBe('Tuesday, Wednesday and Thursday dinners')
  })

  it('a longer horizon says how many days', () => {
    const two = [...days, '2026-11-17', '2026-11-18'].map((d, i) => s(d, 'Dinner', 400 + i))
    expect(summarizeSlots(two, two)).toBe('Every dinner in the next 9 days')
  })

  it('without the whole plan, the affected slots are all it knows', () => {
    expect(summarizeSlots(dinners)).toBe('Every dinner this week')
  })

  it('nothing is an empty string', () => expect(summarizeSlots([], all)).toBe(''))
})
