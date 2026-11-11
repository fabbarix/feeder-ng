import { describe, expect, it } from 'vitest'
import { routes } from './index'

describe('settings feature routes (WP11)', () => {
  it('provides the index and one page per concern', () => {
    expect(routes.map((r) => r.path)).toEqual([
      '/settings',
      '/settings/household',
      '/settings/members',
      '/settings/meal-slots',
      '/settings/courses',
      '/settings/allowlist',
      '/settings/preferences',
      '/settings/recipe-assistant',
    ])
  })

  it('does not claim the sub-pages owned by other features', () => {
    const paths = routes.map((r) => r.path)
    for (const owned of ['/settings/shops', '/settings/shops/:id', '/settings/notifications', '/settings/planning']) expect(paths).not.toContain(owned)
  })
})
