// H5 (decision D5): Settings > Catalogue > Supplies, between Ingredients and Products, for every User.
import { describe, expect, it } from 'vitest'
import { icons } from '../../../ui/icons'
import { settingsGroups } from './settingsSections'

describe('Settings > Catalogue > Supplies', () => {
  const row = (isAdmin: boolean) => settingsGroups(isAdmin).find((g) => g.id === 'catalogue')!.sections.find((s) => s.id === 'supplies')

  it('is the second row of the Catalogue, for Admins and plain Users alike', () => {
    for (const admin of [true, false]) {
      const ids = settingsGroups(admin).find((g) => g.id === 'catalogue')!.sections.map((s) => s.id)
      expect(ids.slice(0, 3)).toEqual(['ingredients', 'supplies', 'products'])
      expect(row(admin)?.adminOnly).toBeFalsy()
    }
  })
  it('leads to /supplies with the Supply glyph and a one-line description in Supply words', () => {
    expect(row(false)).toEqual({
      id: 'supplies',
      title: 'Supplies',
      meta: 'What you buy and keep but never cook with: dish soap, bin bags',
      icon: 'supply',
      path: '/supplies',
    })
    expect(row(false)!.meta).not.toMatch(/\bitems?\b|non-food/i)
  })
  it('has its glyph registered in the shared icon registry', () => {
    expect(Object.keys(icons)).toContain('supply')
  })
})
