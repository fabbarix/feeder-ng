import { describe, expect, it } from 'vitest'
import { PRIMARY_NAV, RAIL_NAV } from './nav'

describe('RAIL_NAV (R11a N8)', () => {
  it('lists the destinations in the bottom-bar order, Today first', () => {
    expect(RAIL_NAV.map((i) => i.id)).toEqual(PRIMARY_NAV.map((i) => i.id))
    expect(RAIL_NAV[0]?.id).toBe('today')
  })
})
