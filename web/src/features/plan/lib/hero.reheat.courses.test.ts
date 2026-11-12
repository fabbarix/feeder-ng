// CRS F review (spec 11): Cook or Reheat for a slot with Courses. A Reheat item is part of the cooking timeline, so
// Reheat alone is offered only when EVERY Course still to cook is served from a Leftover; any fresh Course means Cook.
import { describe, expect, it } from 'vitest'
import { heroSelection } from './hero'
import { courseMeal, courseSlot, planCourse } from '../test-utils'

const today = '2026-11-10'
const noon = new Date('2026-11-10T13:00:00Z')
const source = { leftoverId: 4, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' }
const course = (courseId: number, main: boolean, over = {}, mealOver = {}) =>
  planCourse({ courseId, name: main ? 'Main' : 'Side', main, meal: courseMeal(courseId, main ? 'Main' : 'Side', mealOver), ...over })
const leftover = (courseId: number, main: boolean) => course(courseId, main, {}, { servedFromLeftover: source })
const fresh = (courseId: number, main: boolean) => course(courseId, main)
const cooked = (courseId: number, main: boolean) => course(courseId, main, {}, { state: 'cooked' })
const dinner = (courses: ReturnType<typeof planCourse>[], date = today) => courseSlot(courses, { date, at: `${date}T19:00:00Z` })

describe('heroSelection with a Leftover Course', () => {
  it('a Leftover Main and a fresh Side today: Cook (the timeline holds the Reheat item and the Side\'s Steps)', () => {
    expect(heroSelection([dinner([leftover(1, true), fresh(2, false)])], noon, today)).toMatchObject({ day: 'today', action: 'cook' })
  })

  it('a fresh Main and a Leftover Side today: Cook', () => {
    expect(heroSelection([dinner([fresh(1, true), leftover(2, false)])], noon, today)).toMatchObject({ day: 'today', action: 'cook' })
  })

  it('every Course still to cook is a Leftover: Reheat', () => {
    expect(heroSelection([dinner([leftover(1, true), leftover(2, false)])], noon, today)).toMatchObject({ day: 'today', action: 'reheat' })
  })

  it('a Cooked fresh Side does not count: the only Course to cook is a Leftover, so Reheat', () => {
    expect(heroSelection([dinner([leftover(1, true), cooked(2, false)])], noon, today)).toMatchObject({ action: 'reheat' })
  })

  it('a Cooked Leftover Main and a fresh Side: Cook', () => {
    expect(heroSelection([dinner([cooked(1, true), fresh(2, false)])], noon, today)).toMatchObject({ action: 'cook' })
  })

  it('tomorrow, every Course a Leftover: the chip only', () => {
    expect(heroSelection([dinner([leftover(1, true), leftover(2, false)], '2026-11-11')], noon, today)).toMatchObject({ day: 'tomorrow', action: 'leftover' })
  })

  it('tomorrow, a Leftover Main and a fresh Side: nothing to start yet', () => {
    expect(heroSelection([dinner([leftover(1, true), fresh(2, false)], '2026-11-11')], noon, today)).toMatchObject({ day: 'tomorrow', action: 'none' })
  })
})
