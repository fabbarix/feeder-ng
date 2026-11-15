// B9-34 (B9-23 contract, B9-API-NOTES): PATCH /api/shopping/ticks and PATCH /api/shopping/extras/{id}/tick. 0 is Take back (the tick
// stays); Undo of Take back is the same PATCH with the old quantity; `clientUuid` names the addition when a Line has several.
import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '../../lib/http'
import { createShopApi } from './api'

function client(answer: unknown = { ticked: true, lotId: 5, quantity: 300 }) {
  return { get: vi.fn(), post: vi.fn().mockResolvedValue(answer), put: vi.fn(), patch: vi.fn().mockResolvedValue(answer), delete: vi.fn() } as unknown as HttpClient & {
    patch: ReturnType<typeof vi.fn>
    post: ReturnType<typeof vi.fn>
  }
}

describe('createShopApi: Change and Take back', () => {
  it('changeTick PATCHes the Ingredient, the range end, the quantity, the Shop and the addition\'s client id, and returns the answer', async () => {
    const http = client()
    const out = await createShopApi(http).changeTick({ ingredientId: 9, to: '2026-11-15', quantity: 300, shopId: 1, clientUuid: 'u-1' })
    expect(http.patch).toHaveBeenCalledExactlyOnceWith('/api/shopping/ticks', { ingredientId: 9, to: '2026-11-15', quantity: 300, shopId: 1, clientUuid: 'u-1' })
    expect(out).toEqual({ ticked: true, lotId: 5, quantity: 300 })
  })

  it('0 is sent as 0 (Take back), not left out', async () => {
    const http = client({ ticked: true, lotId: null, quantity: 0 })
    await createShopApi(http).changeTick({ ingredientId: 9, to: '2026-11-15', quantity: 0 })
    expect(http.patch.mock.calls[0]?.[1]).toMatchObject({ quantity: 0 })
  })

  it('changeExtraTick PATCHes the extra\'s tick with the quantity only', async () => {
    const http = client()
    await createShopApi(http).changeExtraTick(4, 300)
    expect(http.patch).toHaveBeenCalledExactlyOnceWith('/api/shopping/extras/4/tick', { quantity: 300 })
  })
})
