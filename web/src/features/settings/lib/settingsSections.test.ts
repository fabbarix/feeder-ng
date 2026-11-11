import { describe, expect, it } from 'vitest'
import { icons } from '../../../ui/icons'
import { settingsGroups } from './settingsSections'

const ids = (isAdmin: boolean) => settingsGroups(isAdmin).map((g) => [g.id, g.sections.map((s) => s.id)])

describe('settingsGroups', () => {
  it('shows an Admin three groups in order', () => {
    expect(ids(true)).toEqual([
      ['household', ['household', 'members', 'mealSlots', 'planningRules', 'shops', 'accessRequests']],
      ['you', ['preferences', 'notifications']],
      ['admin', ['allowlist', 'recipeAssistant']],
    ])
  })

  it('hides the Allowlist and the Recipe Assistant, and their whole group, from a plain User', () => {
    expect(ids(false)).toEqual([
      ['household', ['household', 'members', 'mealSlots', 'planningRules', 'shops', 'accessRequests']],
      ['you', ['preferences', 'notifications']],
    ])
  })

  it('points each row at its page', () => {
    const paths = Object.fromEntries(settingsGroups(true).flatMap((g) => g.sections.map((s) => [s.id, s.path])))
    expect(paths).toEqual({
      household: '/settings/household',
      members: '/settings/members',
      mealSlots: '/settings/meal-slots',
      planningRules: '/settings/planning',
      shops: '/settings/shops',
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

  it('uses GLOSSARY wording for titles', () => {
    const titles = settingsGroups(true).flatMap((g) => g.sections.map((s) => s.title))
    expect(titles).toEqual(['Household', 'Members', 'Meal Slots', 'Planning rules', 'Shops', 'Sign-in requests', 'Your preferences', 'Notifications', 'Allowlist', 'Recipe Assistant'])
  })

  it('A1: "Sign-in requests" is a Household row for every User, after Shops', () => {
    for (const isAdmin of [true, false]) {
      const household = settingsGroups(isAdmin).find((g) => g.id === 'household')!
      expect(household.sections.at(-1)).toMatchObject({ id: 'accessRequests', title: 'Sign-in requests', path: '/settings/access-requests' })
      expect(household.sections.at(-1)?.adminOnly).toBeFalsy()
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
