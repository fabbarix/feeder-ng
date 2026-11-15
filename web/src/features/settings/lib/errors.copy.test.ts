import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { errorMessage } from './errors'

// B9-20 (RES-06): the Settings errors.ts fallback delegates to lib/errorCopy: the generic "Something went wrong. Please try again."
// is gone (existing tests that pin it, e.g. courseRemoval.test.ts, follow). Known codes keep their messages.
describe('settings errorMessage fallback', () => {
  it('a server error says the choices are still on the screen', () => {
    expect(errorMessage(new ApiError(500, 'internal', 'boom'))).toBe('Couldn’t save. Your choices are still on the screen.')
    expect(errorMessage(new Error('x'))).toBe('Couldn’t save. Your choices are still on the screen.')
  })
  it('known codes keep their sentences', () => {
    expect(errorMessage(new ApiError(409, 'last_admin', 'x'))).toBe('The Household needs at least one Admin.')
    expect(errorMessage(new ApiError(0, 'network', 'x'))).toBe('Check your connection and try again.')
  })
})
