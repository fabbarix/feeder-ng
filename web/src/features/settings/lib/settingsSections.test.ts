import { describe, expect, it } from 'vitest'
import { icons } from '../../../ui/icons'
import { settingsGroups } from './settingsSections'

const ids = (isAdmin: boolean) => settingsGroups(isAdmin).map((g) => [g.id, g.sections.map((s) => s.id)])

describe('settingsGroups', () => {
  it('shows an Admin three groups in order', () => {
    expect(ids(true)).toEqual([
      ['household', ['household', 'members', 'mealSlots', 'planningRules', 'shops']],
      ['you', ['preferences', 'notifications']],
      ['admin', ['allowlist']],
    ])
  })

  it('hides the Allowlist, and its whole group, from a plain User', () => {
    expect(ids(false)).toEqual([
      ['household', ['household', 'members', 'mealSlots', 'planningRules', 'shops']],
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
      allowlist: '/settings/allowlist',
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
    expect(titles).toEqual(['Household', 'Members', 'Meal Slots', 'Planning rules', 'Shops', 'Your preferences', 'Notifications', 'Allowlist'])
  })
})
