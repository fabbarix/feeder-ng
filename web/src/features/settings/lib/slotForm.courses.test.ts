// CRS D2: the Courses of a Meal Slot draft (slotForm.ts).
import { describe, expect, it } from 'vitest'
import { choices, tuesdayDinnerCourses } from '../components/courseFixtures'
import { members, tuesdayDinner } from '../components/fixtures'
import { slotDraft, slotFromDraft, slotInputsForWeekdays } from './slotForm'

describe('slotDraft with Courses', () => {
  it('a new Meal Slot starts with the main Course alone', () => {
    expect(slotDraft(undefined, members, choices).courses).toEqual([{ id: 1, optional: false, optOutMemberIds: [] }])
  })

  it('an existing Meal Slot starts with its own Courses, Optional and opt-outs included', () => {
    expect(slotDraft(tuesdayDinnerCourses, members, choices).courses).toEqual([
      { id: 1, optional: false, optOutMemberIds: [] },
      { id: 2, optional: false, optOutMemberIds: [] },
      { id: 4, optional: true, optOutMemberIds: [3] },
    ])
  })

  it('without the household Courses, a draft has no courses key (the form has no Courses field)', () => {
    expect('courses' in slotDraft(undefined, members)).toBe(false)
    expect('courses' in slotDraft(tuesdayDinner, members)).toBe(false)
  })
})

describe('slotInputsForWeekdays and slotFromDraft with Courses', () => {
  const draft = { ...slotDraft(undefined, members, choices), name: ' Dinner ', time: '19:30', courses: [{ id: 1, optional: false, optOutMemberIds: [3] }] }

  it('sends the Courses with every weekday, each a copy', () => {
    const [mon, wed] = slotInputsForWeekdays(draft, [1, 3])
    expect(mon!.courses).toEqual([{ id: 1, optional: false, optOutMemberIds: [3] }])
    mon!.courses![0]!.optOutMemberIds.push(1)
    expect(wed!.courses![0]!.optOutMemberIds).toEqual([3])
    expect(draft.courses[0]!.optOutMemberIds).toEqual([3])
  })

  it('slotFromDraft keeps the Courses', () => {
    expect(slotFromDraft(draft).courses).toEqual(draft.courses)
  })
})
