// ds-plan round 2: the row view model applies the chip cap (the component only renders it).
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CourseRowModel } from '../lib/courses'
import { courseMeal, courseSlot, planCourse, wrapper } from '../test-utils'
import { usePlanCourseRow } from './usePlanCourseRow'

const key = { date: '2026-11-10', mealSlotId: 2, courseId: 1 }
const view = (meal = courseMeal(1, 'Main', { pinned: true, why: [{ code: 'favourite', members: ['Mia'] }, { code: 'slot_rule' }] })) => {
  const course = planCourse({ courseId: 1, meal })
  const row: CourseRowModel = { course, key, caption: 'Main' }
  return renderHook(() => usePlanCourseRow(row, courseSlot([course])), { wrapper }).result.current
}

describe('usePlanCourseRow: the chip cap', () => {
  it('four chips: two shown, "+2" for the rest, naming them', () => {
    const v = view(courseMeal(1, 'Main', { pinned: true, servedFromLeftover: { date: '2026-11-09' } as never, why: [{ code: 'favourite', members: ['Mia'] }, { code: 'slot_rule' }] }))
    expect(v.chips.map((c) => c.label)).toEqual(['Pinned', 'Leftover from Mon'])
    expect(v.more).toMatchObject({ label: '+2', count: 2 })
    expect(v.more?.title).toBe("Mia's favourite, Slot Rule: Tuesday")
  })

  it('three chips: two shown and "+1"; two or fewer: no "+N"', () => {
    expect(view().more).toMatchObject({ label: '+1', title: 'Slot Rule: Tuesday' })
    expect(view(courseMeal(1, 'Main', { why: [{ code: 'favourite', members: ['Mia'] }] })).more).toBeNull()
  })

  it('an empty Course has no "+N"', () => {
    const course = planCourse({ courseId: 1, meal: null })
    const row: CourseRowModel = { course, key, caption: null }
    expect(renderHook(() => usePlanCourseRow(row, courseSlot([course])), { wrapper }).result.current.more).toBeNull()
  })
})
