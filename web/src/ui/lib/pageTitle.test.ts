// B9-19 (A11Y-01): parentCrumb, the label of the crumb just before the current page (breadcrumbs.at(-2)).
import { describe, expect, it } from 'vitest'
import { parentCrumb } from './pageTitle'

describe('parentCrumb', () => {
  it('returns the second-last crumb: the one before the current page', () => {
    expect(parentCrumb([{ label: 'Settings', to: '/settings' }, { label: 'Members' }])).toBe('Settings')
    expect(parentCrumb([{ label: 'Recipes', to: '/recipes' }, { label: 'Pasta al pomodoro', to: '/recipes/1' }, { label: 'Edit Recipe' }])).toBe('Pasta al pomodoro')
  })

  it('is undefined with no trail, an empty trail, or only the current page', () => {
    expect(parentCrumb(undefined)).toBeUndefined()
    expect(parentCrumb([])).toBeUndefined()
    expect(parentCrumb([{ label: 'Recipes' }])).toBeUndefined()
  })
})
