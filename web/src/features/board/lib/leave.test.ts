// B9-47 (TB-04): Close kitchen board goes back one history entry when the board was opened from inside the app, else to Today.
import { describe, expect, it } from 'vitest'
import { leaveTarget } from './leave'

describe('leaveTarget(locationKey)', () => {
  it('"default" is the first entry of the session (the board was opened directly): Today', () => {
    expect(leaveTarget('default')).toBe('/')
  })
  it('any other key means the app navigated here: back one entry', () => {
    expect(leaveTarget('k3x9a1')).toBe(-1)
    expect(leaveTarget('abc')).toBe(-1)
  })
})
