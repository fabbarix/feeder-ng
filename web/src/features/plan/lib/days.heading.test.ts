// ds-plan (option B): the day tile title is one title-3 line, "Thu 12 · Today"; the week grid has no column count and no day spans.
import { describe, expect, it } from 'vitest'
import { courseSlot, planCourse, slot } from '../test-utils'
import { groupByDay } from './days'

const at = (date: string, id = 2) => slot({ date, mealSlotId: id })
const week = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map((d) => at(d))

describe('groupByDay: heading', () => {
  it('reads "<Weekday> <day> · Today | Tomorrow | Yesterday", and "<Weekday> <day>" for any other day', () => {
    const days = groupByDay(week, '2026-11-09')
    expect(days.map((d) => d.heading)).toEqual(['Sun 8 · Yesterday', 'Mon 9 · Today', 'Tue 10 · Tomorrow', 'Wed 11', 'Thu 12'])
  })

  it('the day of the month has no leading zero', () => {
    expect(groupByDay([at('2026-12-03')], '2026-12-01')[0]!.heading).toBe('Thu 3')
  })

  it('a heading is a plain string the tile can put in one h2 (the "Today" word is not a separate field to join)', () => {
    expect(typeof groupByDay(week, '2026-11-09')[0]!.heading).toBe('string')
  })
})

describe('groupByDay: no spans, no column count', () => {
  it('a day has no `span` and no `shortTitle` any more: today is marked by isToday only', () => {
    const days = groupByDay(week, '2026-11-09')
    for (const d of days) {
      expect('span' in d).toBe(false)
      expect('shortTitle' in d).toBe(false)
    }
    expect(days.map((d) => d.isToday)).toEqual([false, true, false, false, false])
  })

  it('takes (slots, today) only', () => {
    expect(groupByDay.length).toBeLessThanOrEqual(2)
  })

  it('keeps slots of a day ordered by time', () => {
    const lunch = courseSlot([planCourse()], { date: '2026-11-09', mealSlotId: 1, name: 'Lunch', time: '12:30' })
    const dinner = courseSlot([planCourse()], { date: '2026-11-09', mealSlotId: 2, name: 'Dinner', time: '19:30' })
    expect(groupByDay([dinner, lunch], '2026-11-09')[0]!.slots.map((s) => s.name)).toEqual(['Lunch', 'Dinner'])
  })
})
