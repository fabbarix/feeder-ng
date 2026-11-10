import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '../../lib/http'
import { createBoardApi } from './api'

describe('createBoardApi', () => {
  it('reads GET /api/board', async () => {
    const data = { now: 'x', today: '2026-11-09', theme: {}, streak: { days: 3 }, nextAdvance: null }
    const get = vi.fn().mockResolvedValue(data)
    expect(await createBoardApi({ get } as unknown as HttpClient).board()).toEqual(data)
    expect(get).toHaveBeenCalledWith('/api/board')
  })
})
