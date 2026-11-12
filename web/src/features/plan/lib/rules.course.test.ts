// TG-PW (crs-f gap 3): the Course of a Slot Rule. Only a slot with several Courses asks for, and shows, a Course.
import { describe, expect, it } from 'vitest'
import { defaultCourseId, ruleCourseName, slotCourseChoices } from './rules'

const several = {
  id: 5,
  weekday: 5,
  name: 'Dinner',
  time: '19:00',
  courses: [
    { id: 1, name: 'Starter', main: false },
    { id: 2, name: 'Main', main: true },
    { id: 3, name: 'Dessert', main: false },
  ],
}
const one = { ...several, courses: [{ id: 2, name: 'Main', main: true }] }
const noCourses = { id: 6, weekday: 6, name: 'Lunch', time: '12:30' }

describe('slotCourseChoices', () => {
  it('lists the slot Courses in the slot order, with the main flag', () => {
    expect(slotCourseChoices(several)).toEqual(several.courses)
  })
  it('is empty for a slot without Courses, or no slot', () => {
    expect(slotCourseChoices(noCourses)).toEqual([])
    expect(slotCourseChoices(undefined)).toEqual([])
  })
})

describe('defaultCourseId', () => {
  it('is the main Course of the slot, whatever its place', () => {
    expect(defaultCourseId(several)).toBe('2')
    expect(defaultCourseId(one)).toBe('2')
  })
  it('is empty when the slot has no Courses', () => {
    expect(defaultCourseId(noCourses)).toBe('')
    expect(defaultCourseId(undefined)).toBe('')
  })
})

describe('ruleCourseName', () => {
  it('names the Course when the slot has several', () => {
    expect(ruleCourseName(several, 3)).toBe('Dessert')
  })
  it('a rule with no courseId is on the main Course', () => {
    expect(ruleCourseName(several, undefined)).toBe('Main')
  })
  it('is null when the slot serves one Course: the row reads as before', () => {
    expect(ruleCourseName(one, 2)).toBeNull()
    expect(ruleCourseName(noCourses, undefined)).toBeNull()
  })
  it('is null for an unknown slot or a Course the slot no longer serves', () => {
    expect(ruleCourseName(undefined, 2)).toBeNull()
    expect(ruleCourseName(several, 99)).toBeNull()
  })
})
