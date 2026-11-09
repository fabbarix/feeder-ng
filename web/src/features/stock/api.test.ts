import { describe, expect, it, vi } from 'vitest'
import { createStockApi } from './api'
import type { HttpClient } from '../../lib/http'

function fakeHttp(): HttpClient & { calls: [string, string, unknown][] } {
  const calls: [string, string, unknown][] = []
  const make = (method: string) => async (path: string, body?: unknown) => {
    calls.push([method, path, body])
    return undefined as never
  }
  return { get: make('GET'), post: make('POST'), put: make('PUT'), patch: make('PATCH'), delete: make('DELETE'), calls } as never
}

describe('createStockApi', () => {
  it('totals unwraps {ingredients}', async () => {
    const http = { ...fakeHttp(), get: vi.fn().mockResolvedValue({ ingredients: [{ ingredientId: 1 }] }) } as unknown as HttpClient
    expect(await createStockApi(http).totals()).toEqual([{ ingredientId: 1 }])
    expect(http.get).toHaveBeenCalledWith('/api/stock')
  })

  it('lots unwraps {lots} and filters by Ingredient', async () => {
    const get = vi.fn().mockResolvedValue({ lots: [{ id: 3 }] })
    const api = createStockApi({ get } as unknown as HttpClient)
    expect(await api.lots(7)).toEqual([{ id: 3 }])
    expect(get).toHaveBeenCalledWith('/api/stock/lots?ingredientId=7')
    await api.lots()
    expect(get).toHaveBeenLastCalledWith('/api/stock/lots')
  })

  it('addLot posts the input; setTotal puts the total', async () => {
    const post = vi.fn().mockResolvedValue({ id: 1 })
    const put = vi.fn().mockResolvedValue({ ingredient: {}, lots: [] })
    const api = createStockApi({ post, put } as unknown as HttpClient)
    await api.addLot({ ingredientId: 7, quantity: 800, purchased: '2026-11-07' })
    expect(post).toHaveBeenCalledWith('/api/stock/lots', { ingredientId: 7, quantity: 800, purchased: '2026-11-07' })
    await api.setTotal(7, 0)
    expect(put).toHaveBeenCalledWith('/api/stock/ingredients/7/total', { total: 0 })
  })

  it('spoiled, throwOut, keep and cooked use the documented routes', async () => {
    const get = vi.fn().mockResolvedValue({ lots: [] })
    const post = vi.fn().mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 }).mockResolvedValueOnce({ warnings: [{ message: 'm' }] })
    const api = createStockApi({ get, post } as unknown as HttpClient)
    expect(await api.spoiled()).toEqual([])
    expect(get).toHaveBeenCalledWith('/api/stock/spoiled')
    await api.throwOut(4)
    expect(post).toHaveBeenCalledWith('/api/stock/lots/4/throw-out')
    await api.keep(4)
    expect(post).toHaveBeenCalledWith('/api/stock/lots/4/keep')
    expect(await api.cooked([{ ingredientId: 7, quantity: 800 }])).toEqual([{ message: 'm' }])
    expect(post).toHaveBeenLastCalledWith('/api/stock/cooked', { needs: [{ ingredientId: 7, quantity: 800 }] })
  })
})
