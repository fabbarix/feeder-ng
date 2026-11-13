// H5 (decision D5): Settings > Supplies > Dish soap.
import { describe, expect, it } from 'vitest'
import { ROUTE_CRUMBS, crumbsFor } from './breadcrumbs'

const S = { label: 'Settings', to: '/settings' }

describe('crumbsFor: Supplies', () => {
  it('the list is Settings > Supplies', () => {
    expect(crumbsFor('/supplies')).toEqual([S, { label: 'Supplies' }])
  })
  it('a Supply is Settings > Supplies > name, and falls back to the GLOSSARY term "Supply"', () => {
    expect(crumbsFor('/supplies/21', 'Dish soap')).toEqual([S, { label: 'Supplies', to: '/supplies' }, { label: 'Dish soap' }])
    expect(crumbsFor('/supplies/21').at(-1)).toEqual({ label: 'Supply' })
  })
  it('does not disturb the Ingredient trail', () => {
    expect(crumbsFor('/ingredients/3', 'Garlic')).toEqual([S, { label: 'Ingredients', to: '/ingredients' }, { label: 'Garlic' }])
  })
  it('has one row per path', () => {
    const paths = ROUTE_CRUMBS.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths).toEqual(expect.arrayContaining(['/supplies', '/supplies/:id']))
  })
})
