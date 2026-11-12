import { describe, expect, it } from 'vitest'
import { icons } from '../../../ui/icons'
import { settingsGroups } from './settingsSections'

const ids = (isAdmin: boolean) => settingsGroups(isAdmin).map((g) => [g.id, g.sections.map((s) => s.id)])

const CATALOGUE = ['ingredients', 'products', 'shops', 'tags', 'courses', 'storagePlaces']
const HOUSEHOLD = ['household', 'members', 'mealSlots', 'planningRules', 'accessRequests']
const ADMIN_ROWS = ['allowlist', 'recipeAssistant']

describe('settingsGroups (beta.5, spec decision 43: Catalogue, Household, You)', () => {
  it('shows an Admin three groups in order; the Admin rows close the Household group, there is no Admin group', () => {
    expect(ids(true)).toEqual([
      ['catalogue', CATALOGUE],
      ['household', [...HOUSEHOLD, ...ADMIN_ROWS]],
      ['you', ['preferences', 'notifications']],
    ])
  })

  it('hides the Allowlist and the Recipe Assistant from a plain User, who keeps all three groups', () => {
    expect(ids(false)).toEqual([
      ['catalogue', CATALOGUE],
      ['household', HOUSEHOLD],
      ['you', ['preferences', 'notifications']],
    ])
  })

  it('marks exactly the Allowlist and the Recipe Assistant as Admins only', () => {
    const rows = settingsGroups(true).flatMap((g) => g.sections)
    expect(rows.filter((s) => s.adminOnly).map((s) => s.id)).toEqual(ADMIN_ROWS)
  })

  it('captions the groups Catalogue, Household and You', () => {
    expect(settingsGroups(true).map((g) => g.title)).toEqual(['Catalogue', 'Household', 'You'])
  })

  it('points each row at its page', () => {
    const paths = Object.fromEntries(settingsGroups(true).flatMap((g) => g.sections.map((s) => [s.id, s.path])))
    expect(paths).toEqual({
      ingredients: '/ingredients',
      products: '/products',
      household: '/settings/household',
      members: '/settings/members',
      mealSlots: '/settings/meal-slots',
      courses: '/settings/courses',
      planningRules: '/settings/planning',
      tags: '/settings/tags',
      shops: '/settings/shops',
      storagePlaces: '/settings/storage-places',
      preferences: '/settings/preferences',
      notifications: '/settings/notifications',
      accessRequests: '/settings/access-requests',
      allowlist: '/settings/allowlist',
      recipeAssistant: '/settings/recipe-assistant',
    })
  })

  it('gives every row a registered icon, a title and a description', () => {
    for (const s of settingsGroups(true).flatMap((g) => g.sections)) {
      expect(Object.keys(icons), s.id).toContain(s.icon)
      expect(s.title, s.id).not.toBe('')
      expect(s.meta, s.id).not.toBe('')
    }
  })

  it('uses GLOSSARY wording for titles, in index order', () => {
    const titles = settingsGroups(true).flatMap((g) => g.sections.map((s) => s.title))
    expect(titles).toEqual(['Ingredients', 'Products', 'Shops', 'Tags', 'Courses', 'Storage Places', 'Household', 'Members', 'Meal Slots', 'Planning rules', 'Sign-in requests', 'Allowlist', 'Recipe Assistant', 'Your preferences', 'Notifications'])
  })

  it('Ingredients and Products lead the Catalogue with their own icons (the avatar menu icons they had)', () => {
    const catalogue = settingsGroups(false).find((g) => g.id === 'catalogue')!
    expect(catalogue.sections.slice(0, 2)).toMatchObject([
      { id: 'ingredients', title: 'Ingredients', path: '/ingredients', icon: 'ingredients' },
      { id: 'products', title: 'Products', path: '/products', icon: 'barcodes' },
    ])
    for (const s of catalogue.sections) expect(s.adminOnly, s.id).toBeFalsy()
  })

  it('Tags, Courses and Storage Places moved from Household to the Catalogue; no Household row is one of them', () => {
    const household = settingsGroups(false).find((g) => g.id === 'household')!.sections.map((s) => s.id)
    for (const moved of ['tags', 'courses', 'storagePlaces', 'shops']) expect(household).not.toContain(moved)
  })

  it('CRS D2: "Courses" is a Catalogue row for every User (read-only for a plain User), right after Tags', () => {
    for (const isAdmin of [true, false]) {
      const catalogue = settingsGroups(isAdmin).find((g) => g.id === 'catalogue')!
      const at = catalogue.sections.findIndex((s) => s.id === 'tags')
      expect(catalogue.sections[at + 1]).toMatchObject({ id: 'courses', title: 'Courses', path: '/settings/courses' })
      expect(catalogue.sections[at + 1]?.adminOnly).toBeFalsy()
    }
  })

  it('TG-S: "Tags" is a Catalogue row for every User, right after Shops, with the spec description and a registered icon', () => {
    for (const isAdmin of [true, false]) {
      const catalogue = settingsGroups(isAdmin).find((g) => g.id === 'catalogue')!
      const at = catalogue.sections.findIndex((s) => s.id === 'shops')
      expect(catalogue.sections[at + 1]).toMatchObject({ id: 'tags', title: 'Tags', meta: 'Names and colours of Recipe Tags', path: '/settings/tags' })
      expect(catalogue.sections[at + 1]?.adminOnly).toBeFalsy()
      expect(Object.keys(icons)).toContain(catalogue.sections[at + 1]!.icon)
    }
  })

  it('A1: "Sign-in requests" is a Household row for every User, after Planning rules and before the Admins-only rows', () => {
    for (const isAdmin of [true, false]) {
      const household = settingsGroups(isAdmin).find((g) => g.id === 'household')!
      const at = household.sections.findIndex((s) => s.id === 'planningRules')
      expect(household.sections[at + 1]).toMatchObject({ id: 'accessRequests', title: 'Sign-in requests', path: '/settings/access-requests' })
      expect(household.sections[at + 1]?.adminOnly).toBeFalsy()
    }
  })

  it('A1: the row\'s meta never carries the count (the badge does), and has a distinct icon from the Allowlist', () => {
    const row = () => settingsGroups(false).flatMap((g) => g.sections).find((s) => s.id === 'accessRequests')!
    expect(row().meta).not.toMatch(/\d/)
    expect(row().meta).not.toBe('')
    const allowlist = settingsGroups(true).flatMap((g) => g.sections).find((s) => s.id === 'allowlist')!
    expect(row().icon).not.toBe(allowlist.icon)
  })
})
