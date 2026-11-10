// R11a: crumb labels live in one strings module and use the GLOSSARY terms (capitalised), never an `_Avoid_` word.
import { describe, expect, it } from 'vitest'
import { breadcrumbStrings } from './breadcrumbStrings'
import { ROUTE_CRUMBS } from './breadcrumbs'

const AVOID = ['store', 'supermarket', 'retailer', 'dish', 'item', 'sku', 'category', 'pantry', 'inventory', 'family']

function values(o: unknown): string[] {
  return typeof o === 'string' ? [o] : Object.values(o as object).flatMap(values)
}

describe('breadcrumbStrings', () => {
  it('uses the capitalised GLOSSARY terms for entities', () => {
    expect(breadcrumbStrings.entity).toEqual({ shop: 'Shop', recipe: 'Recipe', ingredient: 'Ingredient', product: 'Product' })
    expect(breadcrumbStrings.newRecipe).toBe('New Recipe')
  })

  it('no label contains an avoided word', () => {
    const words = [...values(breadcrumbStrings), ...ROUTE_CRUMBS.map((r) => r.label)].flatMap((v) => v.toLowerCase().split(/\W+/))
    for (const bad of AVOID) expect(words, bad).not.toContain(bad)
  })

  it('ROUTE_CRUMBS takes every label from the strings module or the Settings titles (no stray literals)', () => {
    const known = new Set(values(breadcrumbStrings))
    const settingsTitles = ROUTE_CRUMBS.filter((r) => r.path.startsWith('/settings/') && !r.entity).map((r) => r.label)
    for (const r of ROUTE_CRUMBS) expect(known.has(r.label) || settingsTitles.includes(r.label), r.path).toBe(true)
  })
})
