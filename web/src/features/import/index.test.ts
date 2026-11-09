import { describe, expect, it } from 'vitest'
import { collectFeatures } from '../../app/features'
import * as recipes from '../recipes'
import * as feature from './index'

describe('import feature module', () => {
  it('declares the import and export routes', () => {
    expect(feature.routes.map((r) => r.path)).toEqual(['/recipes/import', '/recipes/export'])
  })
  it('does not clash with the Recipes routes', () => {
    const { routes } = collectFeatures({ 'recipes/index.ts': recipes, 'import/index.ts': feature })
    expect(routes.map((r) => r.path)).toEqual(
      expect.arrayContaining(['/recipes', '/recipes/new', '/recipes/:id', '/recipes/import', '/recipes/export']),
    )
  })
})
