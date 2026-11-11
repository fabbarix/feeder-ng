import { describe, expect, it } from 'vitest'
import * as ui from './index'
import type { CourseMultiSelectProps, CoursePickerProps, CoursePickerRowContext, CourseSelectProps } from './index'

describe('ui barrel (CRS D1)', () => {
  it('exports the Course picker and selects with their types', () => {
    expect(typeof ui.CoursePicker).toBe('function')
    expect(typeof ui.CourseSelect).toBe('function')
    expect(typeof ui.CourseMultiSelect).toBe('function')
    expect(typeof ui.courseOptions).toBe('function')
    const types: [CoursePickerProps?, CoursePickerRowContext?, CourseSelectProps?, CourseMultiSelectProps?] = []
    expect(types).toHaveLength(0)
  })
})
