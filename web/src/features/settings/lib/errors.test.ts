import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it.each([
    ['last_admin', /at least one Admin/i],
    ['email_taken', /already on the allowlist/i],
    ['user_already_linked', /already linked/i],
    ['duplicate_slot', /already has a Meal Slot/i],
    ['weekday_mismatch', /weekday/i],
    ['forbidden', /Admin/],
    ['network', /connection|network/i],
  ])('explains %s', (code, message) => {
    expect(errorMessage(new ApiError(409, code, 'raw server text'))).toMatch(message)
  })

  it('passes validation messages through', () => {
    expect(errorMessage(new ApiError(422, 'validation_failed', 'planningHorizonDays: must be 1-28'))).toBe('planningHorizonDays: must be 1-28')
  })

  it('falls back for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toMatch(/something went wrong/i)
    expect(errorMessage('weird')).toMatch(/something went wrong/i)
  })
})
