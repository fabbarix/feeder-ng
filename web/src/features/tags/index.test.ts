// The Tags feature declares /settings/tags, and the shell finds it by itself (app/features.ts).
import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'
import { collectFeatures, discoverFeatures } from '../../app/features'
import { routes } from './index'
import { TagsScreen } from './screens/TagsScreen'

describe('features/tags', () => {
  it('declares /settings/tags and nothing else', () => {
    expect(routes.map((r) => r.path)).toEqual(['/settings/tags'])
  })

  it('renders the TagsScreen', () => {
    const element = routes[0]?.element
    expect(isValidElement(element)).toBe(true)
    expect(isValidElement(element) && element.type).toBe(TagsScreen)
  })

  it('is discovered by the shell, once, with no duplicate of the Settings routes', () => {
    const paths = collectFeatures(discoverFeatures()).routes.map((r) => r.path)
    expect(paths.filter((p) => p === '/settings/tags')).toHaveLength(1)
  })

  it('adds no nav item: Settings > Tags is reached from the Settings index', () => {
    const mod = discoverFeatures()['../features/tags/index.ts']
    expect(mod).toBeDefined()
    expect(mod?.navItems ?? []).toEqual([])
  })
})
