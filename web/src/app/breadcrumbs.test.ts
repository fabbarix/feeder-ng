// R11a: the ONE place that says which routes have a hierarchy and what their crumbs are called (screens never build crumbs).
// web/src/app/breadcrumbs.ts exports ROUTE_CRUMBS (the table) and crumbsFor(pathname, entityName?) (pure, no React).
import { describe, expect, it } from 'vitest'
import { routes as accessRoutes } from '../features/access'
import { routes as importRoutes } from '../features/import'
import { routes as ingredientRoutes } from '../features/ingredients'
import { routes as notificationRoutes } from '../features/notifications'
import { routes as planRoutes } from '../features/plan'
import { routes as productRoutes } from '../features/products'
import { routes as recipeRoutes } from '../features/recipes'
import { routes as settingsRoutes } from '../features/settings'
import { settingsGroups } from '../features/settings/lib/settingsSections'
import { routes as shopsRoutes } from '../features/shops'
import { ROUTE_CRUMBS, crumbsFor } from './breadcrumbs'

const S = { label: 'Settings', to: '/settings' }

describe('crumbsFor: Settings sub-pages', () => {
  it.each([
    ['/settings/household', 'Household'],
    ['/settings/members', 'Members'],
    ['/settings/meal-slots', 'Meal Slots'],
    ['/settings/courses', 'Courses'], // CRS D2
    ['/settings/planning', 'Planning rules'],
    ['/settings/tags', 'Tags'], // TG-S
    ['/settings/shops', 'Shops'],
    ['/ingredients', 'Ingredients'], // beta.5: Settings > Catalogue
    ['/supplies', 'Supplies'], // H5 (decision D5): Settings > Catalogue
    ['/products', 'Products'],
    ['/settings/preferences', 'Your preferences'],
    ['/settings/notifications', 'Notifications'],
    ['/settings/access-requests', 'Sign-in requests'], // A1
    ['/settings/allowlist', 'Allowlist'],
    ['/settings/recipe-assistant', 'Recipe Assistant'],
  ])('%s is Settings > %s', (path, label) => {
    expect(crumbsFor(path)).toEqual([S, { label }])
  })

  it('every Settings index row has its title as the last crumb (copy stays in one place: settingsStrings)', () => {
    for (const section of settingsGroups(true).flatMap((g) => g.sections)) {
      expect(crumbsFor(section.path).at(-1)?.label, section.path).toBe(section.title)
    }
  })

  it('a Shop is Settings > Shops > its name, and falls back to the GLOSSARY term while the name is not loaded', () => {
    expect(crumbsFor('/settings/shops/4', 'Coop')).toEqual([S, { label: 'Shops', to: '/settings/shops' }, { label: 'Coop' }])
    expect(crumbsFor('/settings/shops/4').at(-1)).toEqual({ label: 'Shop' })
  })
})

describe('crumbsFor: Recipes and Import', () => {
  const R = { label: 'Recipes', to: '/recipes' }
  it('Recipe detail: Recipes > name', () => {
    expect(crumbsFor('/recipes/7', 'Chicken & leek pie')).toEqual([R, { label: 'Chicken & leek pie' }])
    expect(crumbsFor('/recipes/7')).toEqual([R, { label: 'Recipe' }])
  })
  it('Recipe edit: Recipes > name (a link to the detail page) > Edit', () => {
    expect(crumbsFor('/recipes/7/edit', 'Chicken & leek pie')).toEqual([R, { label: 'Chicken & leek pie', to: '/recipes/7' }, { label: 'Edit' }])
  })
  it('new Recipe, Import and Export are one level under Recipes (/recipes/new is not a Recipe id)', () => {
    expect(crumbsFor('/recipes/new')).toEqual([R, { label: 'New Recipe' }])
    expect(crumbsFor('/recipes/import')).toEqual([R, { label: 'Import Recipes' }])
    expect(crumbsFor('/recipes/export')).toEqual([R, { label: 'Export Recipes' }])
  })
})

describe('crumbsFor: catalogue detail pages (beta.5: under Settings)', () => {
  it('Ingredient: Settings > Ingredients > name', () => {
    expect(crumbsFor('/ingredients/3', 'Garlic')).toEqual([S, { label: 'Ingredients', to: '/ingredients' }, { label: 'Garlic' }])
    expect(crumbsFor('/ingredients/3').at(-1)).toEqual({ label: 'Ingredient' })
  })
  it('Product: Settings > Products > name', () => {
    expect(crumbsFor('/products/9', 'Whole milk 1 L')).toEqual([S, { label: 'Products', to: '/products' }, { label: 'Whole milk 1 L' }])
    expect(crumbsFor('/products/9').at(-1)).toEqual({ label: 'Product' })
  })
})

describe('crumbsFor: no hierarchy, no crumbs', () => {
  it.each(['/', '/plan', '/shop', '/scan', '/recipes', '/stock', '/pantry', '/settings', '/board', '/cook/recipe/7', '/nope', '/settings/unknown'])(
    '%s has no trail',
    (path) => {
      expect(crumbsFor(path)).toEqual([])
    },
  )

  it('ignores a trailing slash, a query string and a hash', () => {
    expect(crumbsFor('/settings/meal-slots/')).toEqual([S, { label: 'Meal Slots' }])
    expect(crumbsFor('/settings/meal-slots?x=1#y')).toEqual([S, { label: 'Meal Slots' }])
  })
})

describe('shape of every trail', () => {
  const samples = ['/settings/members', '/settings/shops/4', '/recipes/7/edit', '/recipes/import', '/ingredients/3', '/products/9']
  it.each(samples)('%s: ancestors have a path, the current page has none, labels are non-empty', (path) => {
    const trail = crumbsFor(path, 'Name')
    expect(trail.length).toBeGreaterThanOrEqual(2)
    trail.slice(0, -1).forEach((c) => expect(c.to, c.label).toMatch(/^\//))
    expect(trail.at(-1)?.to).toBeUndefined()
    trail.forEach((c) => expect(c.label.trim()).not.toBe(''))
  })
})

describe('the table covers every hierarchical route the features declare', () => {
  const all = [...accessRoutes, ...settingsRoutes, ...planRoutes, ...shopsRoutes, ...notificationRoutes, ...recipeRoutes, ...importRoutes, ...ingredientRoutes, ...productRoutes]
  const ROOTS = new Set(['/settings', '/recipes', '/plan'])
  const hierarchical = all.map((r) => r.path ?? '').filter((p) => p && !ROOTS.has(p))

  it('has an entry per hierarchical route path', () => {
    const known = new Set(ROUTE_CRUMBS.map((r) => r.path))
    for (const path of hierarchical) expect(known.has(path), `ROUTE_CRUMBS lacks ${path}`).toBe(true)
  })

  it('every entry points at a parent that is in the table or is a root', () => {
    const known = new Set([...ROUTE_CRUMBS.map((r) => r.path), ...ROOTS])
    for (const r of ROUTE_CRUMBS) if (r.parent) expect(known.has(r.parent), `${r.path} -> ${r.parent}`).toBe(true)
  })
})
