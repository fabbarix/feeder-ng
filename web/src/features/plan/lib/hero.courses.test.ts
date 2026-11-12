// CRS F: the Today hero and the "next meal" with Courses. A slot is cooked as one block (Cook opens the timeline).
import { describe, expect, it } from 'vitest'
import { heroMeal, nextMeal } from './days'
import { heroSelection, slotCookLabel, slotStartBy } from './hero'
import { courseMeal, courseSlot, planCourse, slot } from '../test-utils'

const now = new Date('2026-11-10T17:00:00Z')
const mainCooked = planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { state: 'cooked' }) })
const sidePlanned = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans' }) })
const mainPlanned = planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken' }) })
const dinner = (courses = [mainPlanned, sidePlanned], over = {}) => courseSlot(courses, { at: '2026-11-10T19:00:00Z', ...over })

describe('a slot with a Planned Meal still to cook in ANY Course is the next meal', () => {
  it('nextMeal and heroMeal pick a slot whose main Course is Cooked but whose Side is not', () => {
    const s = dinner([mainCooked, sidePlanned])
    expect(s.courses?.[0]?.meal?.state).toBe('cooked') // the main Course is Cooked; the Side is still to cook
    expect(nextMeal([s], now)).toBe(s)
    expect(heroMeal([s], now)).toBe(s)
  })

  it('heroSelection offers Cook for it today', () => {
    const s = dinner([mainCooked, sidePlanned])
    expect(heroSelection([s], now, '2026-11-10')).toMatchObject({ slot: s, day: 'today', action: 'cook' })
  })

  it('a slot with every Course Cooked or Not cooked is not the hero', () => {
    const s = dinner([mainCooked, planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { state: 'skipped' }) })])
    expect(heroSelection([s], now, '2026-11-10')).toBeNull()
  })

  it('a one-Course slot is chosen exactly as before', () => {
    const s = slot({ at: '2026-11-10T19:00:00Z' })
    expect(heroSelection([s], now, '2026-11-10')).toMatchObject({ slot: s, day: 'today', action: 'cook' })
  })
})

describe('the Cook button and "start" belong to the slot (the timeline)', () => {
  it('Cook · 30 min from the slot cookMinutes, not from one Recipe', () => {
    expect(slotCookLabel(dinner(undefined, { cookMinutes: 30 }))).toBe('Cook · 30 min')
    expect(slotCookLabel(dinner(undefined, { cookMinutes: 90 }))).toBe('Cook · 1 h 30 min')
  })

  it('without cookMinutes it falls back to the hero Recipe, as for one Course', () => {
    const one = slot({ meal: courseMeal(1, 'Main', { cookMinutes: 45 }) })
    expect(slotCookLabel(one)).toBe('Cook · 45 min')
    expect(slotCookLabel(slot({ cookMinutes: null }))).toBe('Cook')
  })

  it('"start 18:45" is the start of the timeline', () => {
    expect(slotStartBy(dinner(undefined, { startBy: '18:30' }))).toBe('start 18:30')
  })

  it('without a slot startBy the hero Recipe\'s own, else nothing', () => {
    expect(slotStartBy(slot({ meal: courseMeal(1, 'Main', { startBy: '18:45' }) }))).toBe('start 18:45')
    expect(slotStartBy(slot())).toBeNull()
  })
})
