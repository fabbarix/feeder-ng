import { describe, expect, it } from 'vitest'
import { collectFeatures } from '../../app/features'
import * as feature from './index'

describe('ingredients feature module', () => {
  it('declares the list and detail routes', () => {
    expect(feature.routes.map((r) => r.path)).toEqual(['/ingredients', '/ingredients/:id'])
  })
  it('adds one menu item and nothing to the bottom bar', () => {
    expect(feature.navItems).toEqual([
      { id: 'ingredients', label: 'Ingredients', path: '/ingredients', placement: 'menu', order: 30 },
    ])
  })
  it('is accepted by the shell', () => {
    const { routes, navItems } = collectFeatures({ 'ingredients/index.ts': feature })
    expect(routes).toHaveLength(2)
    expect(navItems.map((n) => n.path)).toEqual(['/ingredients'])
  })
})
