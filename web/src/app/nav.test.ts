import { describe, expect, it } from 'vitest'
import { MENU_NAV, PRIMARY_NAV, RAIL_NAV } from './nav'

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

describe('PRIMARY_NAV: Pantry is a first-class destination (PN)', () => {
  it('is Today, Plan, Pantry, Scan, Shop, Recipes: Scan has three destinations before it and two after', () => {
    expect(PRIMARY_NAV.map((i) => i.id)).toEqual(['today', 'plan', 'pantry', 'scan', 'shop', 'recipes'])
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual(['Today', 'Plan', 'Pantry', 'Scan', 'Shop', 'Recipes'])
    expect(PRIMARY_NAV.map((i) => i.path)).toEqual(['/', '/plan', '/pantry', '/scan', '/shop', '/recipes'])
  })
  it('Pantry uses the stock icon and is not the accent button; only Scan is', () => {
    const pantry = PRIMARY_NAV.find((i) => i.id === 'pantry')
    expect(pantry).toMatchObject({ label: 'Pantry', path: '/pantry', icon: 'stock' })
    expect(pantry?.accent).toBeUndefined()
    expect(PRIMARY_NAV.filter((i) => i.accent).map((i) => i.id)).toEqual(['scan'])
  })
  it('the rail lists the same six, in the same order', () => {
    expect(RAIL_NAV.map((i) => i.id)).toEqual(['today', 'plan', 'pantry', 'scan', 'shop', 'recipes'])
  })
  it('the avatar menu no longer lists Pantry (nor /stock): Kitchen board, Settings', () => {
    expect(MENU_NAV.map((i) => i.id)).toEqual(['board', 'settings'])
    expect(MENU_NAV.map((i) => i.path)).not.toContain('/stock')
    expect(MENU_NAV.map((i) => i.path)).not.toContain('/pantry')
  })
  it('no destination is listed in both the bar and the menu', () => {
    const bar = new Set(PRIMARY_NAV.map((i) => i.path))
    for (const m of MENU_NAV) expect(bar.has(m.path), m.path).toBe(false)
  })
})
