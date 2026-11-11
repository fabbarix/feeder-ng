import { describe, expect, it } from 'vitest'
import { signedOutView } from './signedOutView'

describe('signedOutView at /waiting-for-approval (A1)', () => {
  it('shows the waiting page', () => {
    expect(signedOutView('/waiting-for-approval', '')).toEqual({ view: 'waiting', kind: 'waiting' })
    expect(signedOutView('/waiting-for-approval/', '')).toEqual({ view: 'waiting', kind: 'waiting' })
  })
  it('carries the limited and full states', () => {
    expect(signedOutView('/waiting-for-approval', '?state=limited')).toEqual({ view: 'waiting', kind: 'limited' })
    expect(signedOutView('/waiting-for-approval', '?state=full')).toEqual({ view: 'waiting', kind: 'full' })
    expect(signedOutView('/waiting-for-approval', '?state=bogus')).toEqual({ view: 'waiting', kind: 'waiting' })
  })
  it('keeps /not-invited for unverified addresses', () => {
    expect(signedOutView('/not-invited', '')).toEqual({ view: 'not-invited' })
  })
})
