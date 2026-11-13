// H9: typed calls for POST /api/stock/ingredients/{id}/use and .../use/undo (household-items.md section 4.11).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, string, unknown?]> = []
const reply = vi.hoisted(() => ({ value: {} as unknown }))
vi.mock('../../lib/http', () => {
  const rec = (m: string) => async (path: string, body?: unknown) => {
    calls.push([m, path, body])
    return reply.value
  }
  return { http: { get: rec('GET'), post: rec('POST'), put: rec('PUT'), patch: rec('PATCH'), delete: rec('DELETE') } }
})

import { supplyUseApi } from './supplyUseApi'
import type { SupplyUseResult } from './types'

const used: SupplyUseResult = {
  ingredientId: 22, name: 'toilet paper', baseUnit: 'piece', quantity: 1, total: 12,
  taken: [{ lotId: 11, quantity: 1, purchased: '2026-11-01', storagePlaceId: 3, productId: 5, shopId: 6 }],
}

describe('supplyUseApi', () => {
  beforeEach(() => {
    calls.length = 0
    reply.value = used
  })
  it('uses a quantity of a Supply and resolves with what was taken from each Lot', async () => {
    await expect(supplyUseApi.use(22, 1)).resolves.toEqual(used)
    expect(calls).toEqual([['POST', '/api/stock/ingredients/22/use', { quantity: 1 }]])
  })
  it('sends a fractional amount as it is', async () => {
    await supplyUseApi.use(21, 125.5)
    expect(calls).toEqual([['POST', '/api/stock/ingredients/21/use', { quantity: 125.5 }]])
  })
  it('undoes with exactly the Lots that were taken', async () => {
    await expect(supplyUseApi.undo(22, used.taken)).resolves.toEqual(used)
    expect(calls).toEqual([['POST', '/api/stock/ingredients/22/use/undo', { taken: used.taken }]])
  })
})
