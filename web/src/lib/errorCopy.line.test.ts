// B9-20 (RES-06): the one-line form of a failed action, for a dialog, a sheet or a plain toast.
import { describe, expect, it } from 'vitest'
import { actionFailed, failureLine } from './errorCopy'
import { ApiError } from './http'

describe('failureLine', () => {
  it('names what failed and says Try again for a server failure', () => {
    expect(failureLine(actionFailed('delete Starter', new ApiError(500, 'internal', 'x'), { online: true }))).toBe('Couldn’t delete Starter. Try again.')
  })
  it('says Feeder is offline, and when to try again, offline', () => {
    expect(failureLine(actionFailed('delete Starter', new ApiError(0, 'network', 'x'), { online: true }))).toBe(
      'Couldn’t delete Starter. Feeder is offline. Try again when you’re back online.',
    )
    expect(failureLine(actionFailed('delete Starter', new ApiError(500, 'internal', 'x'), { online: false }))).toMatch(/Feeder is offline/)
  })
  it('is the known sentence alone for a known code', () => {
    expect(failureLine(actionFailed('delete Starter', new ApiError(409, 'x_known', 'x'), { known: { x_known: 'Make another Course main first.' } }))).toBe(
      'Make another Course main first.',
    )
  })
})
