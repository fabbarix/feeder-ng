import { describe, expect, it } from 'vitest'
import { dateWithCourses } from '../components/courseFixtures'
import { thursdayDinner } from '../components/fixtures'
import type { DateCourse } from '../types'
import { dateCourseChanges, dateCourseDrafts, hasDateOverride, resetDateCourse, sameAttendance, withDateEater } from './dateCourses'

const served = dateWithCourses.courses!
const drafts = () => dateCourseDrafts(served)
const overridden = (id: number, optOut: number[]): DateCourse[] => served.map((c) => (c.courseId === id ? { ...c, optOutMemberIds: optOut, isOverride: true } : c))

describe('dateCourseDrafts', () => {
  it('starts from each Course of the date, in the slot\'s order, as copies', () => {
    const d = drafts()
    expect(d.map((x) => [x.courseId, x.name, x.optOutMemberIds, x.isOverride])).toEqual([[1, 'Main', [], false], [2, 'Side', [], false], [4, 'Dessert', [3], false]])
    d[2]!.optOutMemberIds.push(1)
    expect(served[2]!.optOutMemberIds).toEqual([3])
  })
})

describe('withDateEater and resetDateCourse', () => {
  it('a pill change gives the Course its own opt-outs for the date, others untouched', () => {
    const d = withDateEater(drafts(), 4, 1, false)
    expect(d[2]).toMatchObject({ courseId: 4, optOutMemberIds: [3, 1], isOverride: true })
    expect(d[0]).toEqual(drafts()[0])
    expect(withDateEater(drafts(), 4, 3, true)[2]).toMatchObject({ optOutMemberIds: [], isOverride: true })
  })

  it('Reset to usual puts the usual opt-outs back and drops the override', () => {
    const changed = withDateEater(drafts(), 4, 1, false)
    expect(resetDateCourse(changed, 4, [3])[2]).toMatchObject({ optOutMemberIds: [3], isOverride: false })
  })

  it('leave their input alone', () => {
    const d = drafts()
    withDateEater(d, 2, 1, false)
    resetDateCourse(d, 2, [])
    expect(d).toEqual(drafts())
  })
})

describe('dateCourseChanges (what Save for this date sends)', () => {
  it('names nothing when nothing changed', () => expect(dateCourseChanges(served, drafts())).toEqual([]))

  it('sends the list for a Course that now has its own opt-outs', () => {
    expect(dateCourseChanges(served, withDateEater(drafts(), 2, 1, false))).toEqual([{ courseId: 2, optOutMemberIds: [1] }])
  })

  it('sends null for a Course that was an override and is reset', () => {
    const was = overridden(4, [3, 1])
    expect(dateCourseChanges(was, resetDateCourse(dateCourseDrafts(was), 4, [3]))).toEqual([{ courseId: 4, optOutMemberIds: null }])
  })

  it('does not make an override out of a pill changed and changed back', () => {
    const back = withDateEater(withDateEater(drafts(), 2, 1, false), 2, 1, true)
    expect(dateCourseChanges(served, back)).toEqual([])
  })

  it('sends a changed list for a Course that was already an override, and nothing for an untouched one', () => {
    const was = overridden(4, [3, 1])
    expect(dateCourseChanges(was, withDateEater(dateCourseDrafts(was), 4, 2, false))).toEqual([{ courseId: 4, optOutMemberIds: [3, 1, 2] }])
    expect(dateCourseChanges(was, dateCourseDrafts(was))).toEqual([])
  })
})

describe('sameAttendance and hasDateOverride', () => {
  const a = thursdayDinner.attendance
  it('sameAttendance compares Members and overrides, order ignored', () => {
    expect(sameAttendance(a, [...a].reverse())).toBe(true)
    expect(sameAttendance(a, a.slice(0, 2))).toBe(false)
    expect(sameAttendance(a, a.map((e) => (e.memberId === 3 ? { ...e, portionFactorOverride: 1 } : e)))).toBe(false)
  })

  it('hasDateOverride is true for an Attendance override or any Course override', () => {
    expect(hasDateOverride(undefined)).toBe(false)
    expect(hasDateOverride({ isOverride: false, courses: [{ isOverride: false }] })).toBe(false)
    expect(hasDateOverride({ isOverride: true })).toBe(true)
    expect(hasDateOverride({ isOverride: false, courses: [{ isOverride: false }, { isOverride: true }] })).toBe(true)
  })
})
