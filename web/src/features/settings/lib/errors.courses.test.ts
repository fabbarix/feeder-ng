// CRS D2: the Courses refusals of a Meal Slot save, by `reason` (functional-spec 3.1 and 16).
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { batchErrorMessage, errorMessage } from './errors'

const refusal = (reason: string, message = 'server wording') => new ApiError(422, 'validation_failed', message, { field: 'courses', reason })

describe('Courses refusals', () => {
  it.each([
    ['courses_all_optional', 'Keep at least one Course that is not optional'],
    ['courses_empty', 'Choose at least one Course'],
    ['course_unknown', 'One of the Courses is no longer in the list.'],
  ])('%s reads "%s" however the server words it', (reason, text) => {
    expect(errorMessage(refusal(reason))).toBe(text)
    expect(batchErrorMessage(refusal(reason))).toBe(text)
  })

  it('other validation errors keep the server wording', () => {
    expect(errorMessage(new ApiError(422, 'validation_failed', 'name: required', { field: 'name' }))).toBe('name: required')
    expect(errorMessage(refusal('member_unknown', 'courses[0].optOutMemberIds: unknown Member'))).toBe('courses[0].optOutMemberIds: unknown Member')
  })
})
