import { describe, expect, it } from 'vitest'
import { withAccessRequests } from './accessMenu'
import { MENU_NAV } from './nav'

describe('withAccessRequests', () => {
  it('leaves the menu alone when nobody waits', () => {
    const items = [...MENU_NAV]
    expect(withAccessRequests(items, 0)).toBe(items)
  })
  it('puts Sign-in requests just before Settings while some wait', () => {
    const ids = withAccessRequests([...MENU_NAV], 2).map((i) => i.id)
    expect(ids.indexOf('access-requests')).toBe(ids.indexOf('settings') - 1)
  })
  it('appends it when there is no Settings entry', () => {
    expect(withAccessRequests([], 1).map((i) => i.id)).toEqual(['access-requests'])
  })
})
