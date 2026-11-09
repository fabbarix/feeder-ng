import { describe, expect, it } from 'vitest'
import { GOOGLE_LOGIN_PATH, signedOutView } from './signedOutView'

describe('signedOutView', () => {
  it('shows the sign-in page by default, whatever the path', () => {
    expect(signedOutView('/', '')).toEqual({ view: 'sign-in' })
    expect(signedOutView('/plan', '')).toEqual({ view: 'sign-in' })
    expect(signedOutView('/sign-in', '')).toEqual({ view: 'sign-in' })
  })

  it('carries the reason Google or the server gave', () => {
    expect(signedOutView('/sign-in', '?error=denied')).toEqual({ view: 'sign-in', reason: 'denied' })
    expect(signedOutView('/sign-in', '?error=failed')).toEqual({ view: 'sign-in', reason: 'failed' })
  })

  it('ignores reasons it does not know', () => {
    expect(signedOutView('/sign-in', '?error=<script>')).toEqual({ view: 'sign-in' })
  })

  it('shows the not-invited page at /not-invited', () => {
    expect(signedOutView('/not-invited', '')).toEqual({ view: 'not-invited' })
    expect(signedOutView('/not-invited/', '')).toEqual({ view: 'not-invited' })
  })

  it('starts Google sign-in at the server route', () => {
    expect(GOOGLE_LOGIN_PATH).toBe('/auth/google/login')
  })
})
