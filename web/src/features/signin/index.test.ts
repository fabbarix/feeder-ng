import { describe, expect, it } from 'vitest'
import { routes } from './index'

describe('signin feature', () => {
  it('declares the signed-out paths so a signed-in visit can redirect home', () => {
    expect(routes.map((r) => r.path).sort()).toEqual(['/email-not-verified', '/not-invited', '/sign-in', '/waiting-for-approval'])
  })

  it('sends a signed-in visit to the old /not-invited on to /email-not-verified (which goes home)', () => {
    const to = (p: string) => (routes.find((r) => r.path === p)?.element as { props: { to: string } }).props.to
    expect(to('/not-invited')).toBe('/email-not-verified')
    expect(to('/email-not-verified')).toBe('/')
  })
})
