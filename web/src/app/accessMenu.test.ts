import { describe, expect, it } from 'vitest'
import { withAccessRequests } from './accessMenu'
import { MENU_NAV } from './nav'

describe('withAccessRequests', () => {
  it('leaves the menu alone when nobody waits', () => {
    const items = [...MENU_NAV]
    expect(withAccessRequests(items, 0)).toBe(items)
  })
  it('Settings is no longer a menu entry (nav-even): Sign-in requests follows Kitchen board while some wait', () => {
    const ids = withAccessRequests([...MENU_NAV], 2).map((i) => i.id)
    expect(ids).toEqual(['board', 'access-requests'])
  })
  it('still puts it before a Settings entry when one is given (legacy ordering)', () => {
    const items = [{ id: 'settings', label: 'Settings', path: '/settings', placement: 'menu' as const }]
    expect(withAccessRequests(items, 1).map((i) => i.id)).toEqual(['access-requests', 'settings'])
  })
  it('appends it when there is no Settings entry', () => {
    expect(withAccessRequests([], 1).map((i) => i.id)).toEqual(['access-requests'])
  })
})
