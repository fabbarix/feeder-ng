import { describe, expect, it } from 'vitest'
import { routes } from './index'

describe('signin feature', () => {
  it('declares the signed-out paths so a signed-in visit can redirect home', () => {
    expect(routes.map((r) => r.path).sort()).toEqual(['/not-invited', '/sign-in', '/waiting-for-approval'])
  })
})
