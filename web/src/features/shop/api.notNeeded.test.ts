import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '../../lib/http'
import { createShopApi } from './api'
import { makeList } from './testData'

// B5-SH: POST /api/shopping/not-needed and DELETE /api/shopping/not-needed/{ingredientId}?to=, both answering the list.

function client(list = makeList()) {
  return { get: vi.fn(), post: vi.fn().mockResolvedValue(list), put: vi.fn(), patch: vi.fn(), delete: vi.fn().mockResolvedValue(list) } as unknown as HttpClient & {
    post: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

describe('createShopApi Not needed', () => {
  it('posts the Ingredient and the range end and returns the list', async () => {
    const list = makeList({ notNeeded: [] })
    const http = client(list)
    expect(await createShopApi(http).notNeeded({ ingredientId: 2, to: '2026-11-15' })).toEqual(list)
    expect(http.post).toHaveBeenCalledWith('/api/shopping/not-needed', { ingredientId: 2, to: '2026-11-15' })
  })

  it('sends the Shop with the mark when one is picked, so the list that comes back is priced there', async () => {
    const http = client()
    await createShopApi(http).notNeeded({ ingredientId: 2, to: '2026-11-15', shopId: 4 })
    expect(http.post).toHaveBeenCalledWith('/api/shopping/not-needed', { ingredientId: 2, to: '2026-11-15', shopId: 4 })
  })

  it('"Needed after all" deletes the mark of that range', async () => {
    const http = client()
    await createShopApi(http).neededAfterAll(2, '2026-11-15')
    expect(http.delete).toHaveBeenCalledWith('/api/shopping/not-needed/2?to=2026-11-15')
  })

  it('"Needed after all" passes the Shop as ?shop=', async () => {
    const http = client()
    await createShopApi(http).neededAfterAll(2, '2026-11-15', 4)
    expect(http.delete).toHaveBeenCalledWith('/api/shopping/not-needed/2?to=2026-11-15&shop=4')
  })
})
