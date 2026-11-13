import { describe, expect, it, vi } from 'vitest'
import { createStockApi } from './api'
import type { HttpClient } from '../../lib/http'

describe('createStockApi: editing a Lot (beta.5)', () => {
  it('updateLot patches the Lot with only what changed and returns the corrected Lot', async () => {
    const patch = vi.fn().mockResolvedValue({ id: 5, quantity: 650 })
    const api = createStockApi({ patch } as unknown as HttpClient)
    expect(await api.updateLot(5, { quantity: 650, goesOff: null })).toEqual({ id: 5, quantity: 650 })
    expect(patch).toHaveBeenCalledWith('/api/stock/lots/5', { quantity: 650, goesOff: null })
  })

  it('deleteLot deletes the Lot', async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    const api = createStockApi({ delete: del } as unknown as HttpClient)
    await api.deleteLot(5)
    expect(del).toHaveBeenCalledWith('/api/stock/lots/5')
  })
})
