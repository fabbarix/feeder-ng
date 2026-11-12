import { describe, expect, it } from 'vitest'
import { collectFeatures } from '../../app/features'
import * as feature from './index'

describe('ingredients feature module', () => {
  it('declares the list and detail routes', () => {
    expect(feature.routes.map((r) => r.path)).toEqual(['/ingredients', '/ingredients/:id'])
  })
  it('adds no menu item: Ingredients is reached from Settings > Catalogue (spec decision 43)', () => {
    expect(feature.navItems ?? []).toEqual([])
  })
  it('is accepted by the shell', () => {
    const { routes, navItems } = collectFeatures({ 'ingredients/index.ts': feature })
    expect(routes).toHaveLength(2)
    expect(navItems).toEqual([])
  })
})
