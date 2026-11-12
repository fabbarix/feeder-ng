import { describe, expect, it, vi } from 'vitest'
import { collectFeatures } from '../../app/features'
import * as recipes from '../recipes'
import * as feature from './index'
import { createMemoryPhotoStore } from './lib/photoStore'

const device = vi.hoisted(() => ({ store: undefined as undefined | import('./lib/photoStore').PhotoStore }))
vi.mock('./lib/photoStoreIdb', async (orig) => ({ ...(await orig<object>()), appPhotoStore: () => device.store }))

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

describe('forgetStoredPhotos (called by sign-out)', () => {
  it('empties the on-device photo store', async () => {
    const store = createMemoryPhotoStore()
    device.store = store
    await store.save({ id: 'p1', userId: 7, order: 0, source: { kind: 'link', url: 'https://example.com/a.jpg' }, edit: null })
    await feature.forgetStoredPhotos()
    expect(await store.load()).toEqual([])
  })
  it('resolves even when there is nothing stored', async () => {
    device.store = createMemoryPhotoStore()
    await expect(feature.forgetStoredPhotos()).resolves.toBeUndefined()
  })
})
