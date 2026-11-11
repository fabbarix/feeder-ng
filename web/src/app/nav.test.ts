import { describe, expect, it } from 'vitest'
import { PRIMARY_NAV, RAIL_NAV } from './nav'

describe('RAIL_NAV (R11a N8)', () => {
  it('lists the destinations in the bottom-bar order, Today first', () => {
    expect(RAIL_NAV.map((i) => i.id)).toEqual(PRIMARY_NAV.map((i) => i.id))
    expect(RAIL_NAV[0]?.id).toBe('today')
  })
})

describe('menuIconFor (S-01)', () => {
  it('uses the entry icon, else the registered one for Ingredients, Products and Shops, else the chevron', async () => {
    const { menuIconFor } = await import('./nav')
    expect(menuIconFor({ id: 'stock', icon: 'stock' })).toBe('stock')
    expect(menuIconFor({ id: 'ingredients' })).toBe('ingredients')
    expect(menuIconFor({ id: 'products' })).toBe('barcodes')
    expect(menuIconFor({ id: 'shops' })).toBe('shops')
    expect(menuIconFor({ id: 'other' })).toBe('chevron')
  })
})
