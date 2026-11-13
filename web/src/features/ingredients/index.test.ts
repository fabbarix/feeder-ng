import { describe, expect, it } from 'vitest'
import { collectFeatures } from '../../app/features'
import * as feature from './index'

describe('ingredients feature module', () => {
  it('declares the list and detail routes of Ingredients and, by decision D5, of Supplies', () => {
    expect(feature.routes.map((r) => r.path)).toEqual(['/ingredients', '/ingredients/:id', '/supplies', '/supplies/:id'])
  })
  it('adds no menu item: Ingredients is reached from Settings > Catalogue (spec decision 43)', () => {
    expect(feature.navItems ?? []).toEqual([])
  })
  it('is accepted by the shell', () => {
    const { routes, navItems } = collectFeatures({ 'ingredients/index.ts': feature })
    expect(routes).toHaveLength(4)
    expect(navItems).toEqual([])
  })
})
