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

describe('PRIMARY_NAV: seven slots, Settings top-level (nav-even)', () => {
  const ids = ['today', 'plan', 'pantry', 'scan', 'shop', 'recipes', 'settings']
  it('is Today, Plan, Pantry, Scan, Shop, Recipes, Settings: three destinations on each side of Scan', () => {
    expect(PRIMARY_NAV.map((i) => i.id)).toEqual(ids)
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual(['Today', 'Plan', 'Pantry', 'Scan', 'Shop', 'Recipes', 'Settings'])
    expect(PRIMARY_NAV.map((i) => i.path)).toEqual(['/', '/plan', '/pantry', '/scan', '/shop', '/recipes', '/settings'])
    expect(PRIMARY_NAV.findIndex((i) => i.id === 'scan')).toBe(3)
    expect(PRIMARY_NAV).toHaveLength(7)
  })
  it('Scan is the exact middle item: as many destinations before it as after it', () => {
    const at = PRIMARY_NAV.findIndex((i) => i.id === 'scan')
    expect(at).toBe(PRIMARY_NAV.length - 1 - at)
  })
  it('Settings uses the settings icon, is the last item and not the accent button; only Scan is', () => {
    const settings = PRIMARY_NAV[PRIMARY_NAV.length - 1]
    expect(settings).toMatchObject({ id: 'settings', label: 'Settings', path: '/settings', icon: 'settings' })
    expect(settings?.accent).toBeUndefined()
    expect(PRIMARY_NAV.filter((i) => i.accent).map((i) => i.id)).toEqual(['scan'])
  })
  it('Pantry still uses the stock icon', () => {
    expect(PRIMARY_NAV.find((i) => i.id === 'pantry')).toMatchObject({ label: 'Pantry', path: '/pantry', icon: 'stock' })
  })
  it('the rail lists the same seven, in the same order', () => {
    expect(RAIL_NAV.map((i) => i.id)).toEqual(ids)
  })
  it('the avatar menu lists only Kitchen board now: Settings left it, Pantry and /stock are not there either', () => {
    expect(MENU_NAV.map((i) => i.id)).toEqual(['board'])
    expect(MENU_NAV.map((i) => i.path)).not.toContain('/settings')
    expect(MENU_NAV.map((i) => i.path)).not.toContain('/stock')
    expect(MENU_NAV.map((i) => i.path)).not.toContain('/pantry')
  })
  it('no destination is listed in both the bar and the menu', () => {
    const bar = new Set(PRIMARY_NAV.map((i) => i.path))
    for (const m of MENU_NAV) expect(bar.has(m.path), m.path).toBe(false)
  })
})
