// DS-TODAY: the hero's eyebrow is ONE line "Tomorrow · Dinner · start 19:09" (day, Meal Slot, start-by or slot time). It replaces
// the upper-case overline ("DINNER · 19:30") and the separate "start 18:45" paragraph; CSS upper-cases it.
import { describe, expect, it } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import { heroEyebrow, type HeroSelection } from './hero'

const noon = new Date('2026-11-10T12:00:00Z')
const dinner = (over = {}) => slot({ at: '2026-11-10T19:30:00Z', time: '19:30', name: 'Dinner', meal: meal({ startBy: '18:45' }), ...over })
const sel = (s: ReturnType<typeof slot>, day: HeroSelection['day'], action: HeroSelection['action'] = 'cook'): HeroSelection => ({ slot: s, day, action })

describe('heroEyebrow', () => {
  it('today, before the slot time, with a start-by: ["Today", "Dinner", "start 18:45"]', () => {
    expect(heroEyebrow(sel(dinner(), 'today'), noon)).toEqual(['Today', 'Dinner', 'start 18:45'])
  })

  it('today without a start-by: the slot time instead', () => {
    expect(heroEyebrow(sel(dinner({ meal: meal() }), 'today'), noon)).toEqual(['Today', 'Dinner', '19:30'])
  })

  it('today after the slot time (awaiting): the slot time, no start-by', () => {
    expect(heroEyebrow(sel(dinner(), 'today'), new Date('2026-11-10T20:30:00Z'))).toEqual(['Today', 'Dinner', '19:30'])
  })

  it('tomorrow: "Tomorrow · Lunch · start 12:30" (the day word replaces the date)', () => {
    const lunch = slot({ date: '2026-11-11', at: '2026-11-11T13:00:00Z', time: '13:00', name: 'Lunch', meal: meal({ date: '2026-11-11', startBy: '12:30' }) })
    expect(heroEyebrow(sel(lunch, 'tomorrow', 'none'), noon)).toEqual(['Tomorrow', 'Lunch', 'start 12:30'])
  })

  it('later: the short weekday, "Fri · Lunch · 13:00"', () => {
    const lunch = slot({ date: '2026-11-13', at: '2026-11-13T13:00:00Z', time: '13:00', name: 'Lunch', meal: meal({ date: '2026-11-13' }) })
    expect(heroEyebrow(sel(lunch, 'later', 'none'), noon)).toEqual(['Fri', 'Lunch', '13:00'])
  })

  it('uses the date\'s own time (B5-F1) and, for several Courses, the timeline\'s startBy', () => {
    const several = courseSlot(
      [planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { startBy: '19:00' }) }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })],
      { name: 'Dinner', time: '20:15', at: '2026-11-10T20:15:00Z', startBy: '19:40' },
    )
    expect(heroEyebrow(sel(several, 'today'), noon)).toEqual(['Today', 'Dinner', 'start 19:40'])
  })
})
