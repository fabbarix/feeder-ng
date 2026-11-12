// CRS C3 test support: a slot exactly as GET /api/plan sends it after C3, with its Courses and NO `meal` / `unfilled`
// of its own (spec 16). The default `slot()` / `courseSlot()` of test-utils still carry the alias fields, so a test that
// must prove the SPA reads the Course rows builds its slot here.
import type { PlanCourse, PlanSlot } from './types'
import { courseSlot } from './test-utils'

export function serverSlot(courses: PlanCourse[], over: Partial<PlanSlot> = {}): PlanSlot {
  return courseSlot(courses, over)
}
