// CRS D2: the Courses in the multi-day Meal Slot edit (multiDay.ts): only a changed list is sent.
import { describe, expect, it } from 'vitest'
import { tuesdayDinnerCourses } from '../components/courseFixtures'
import { tuesdayDinner } from '../components/fixtures'
import type { MealSlotInput, SlotCourseInput } from '../types'
import { batchRequest, changedFields, hasChanges } from './multiDay'

const original = tuesdayDinnerCourses
const draftOf = (courses?: SlotCourseInput[]): MealSlotInput => ({
  weekday: original.weekday,
  name: original.name,
  time: original.time,
  attendance: original.attendance,
  ...(courses ? { courses } : {}),
})
const same = (): SlotCourseInput[] => [
  { id: 1, optional: false, optOutMemberIds: [] },
  { id: 2, optional: false, optOutMemberIds: [] },
  { id: 4, optional: true, optOutMemberIds: [3] },
]

describe('changedFields with Courses', () => {
  it('leaves the Courses out when they are as they were', () => {
    expect(changedFields(original, draftOf(same()))).toEqual({})
  })

  it('sends the whole list when the order, a flag or an opt-out changed', () => {
    const reordered = [same()[1]!, same()[0]!, same()[2]!]
    expect(changedFields(original, draftOf(reordered))).toEqual({ courses: reordered })
    const optional = same().map((c) => (c.id === 2 ? { ...c, optional: true } : c))
    expect(changedFields(original, draftOf(optional))).toEqual({ courses: optional })
    const optOut = same().map((c) => (c.id === 1 ? { ...c, optOutMemberIds: [2] } : c))
    expect(changedFields(original, draftOf(optOut))).toEqual({ courses: optOut })
  })

  it('a draft without a courses key never sends Courses', () => {
    expect(changedFields(tuesdayDinner, draftOf())).toEqual({})
  })

  it('combines with the other fields, which are untouched', () => {
    const courses = [same()[0]!]
    expect(changedFields(original, { ...draftOf(courses), name: 'Supper' })).toEqual({ name: 'Supper', courses })
  })
})

describe('hasChanges and batchRequest with Courses', () => {
  it('Courses alone are a change', () => {
    expect(hasChanges({ courses: [] })).toBe(true)
    expect(hasChanges({})).toBe(false)
  })

  it('batchRequest carries set.courses and is not a dry run', () => {
    const courses = [same()[0]!]
    const request = batchRequest(original, [4, 2], draftOf(courses))
    expect(request).toEqual({ match: 'Dinner', weekdays: [2, 4], set: { courses } })
    expect(request.dryRun).toBeUndefined()
  })
})
