import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '../../lib/http'
import { createCookApi } from './api'

function client(over: Partial<Record<'get' | 'post' | 'put' | 'delete', unknown>> = {}) {
  return { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}), put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue(undefined), ...over } as unknown as HttpClient & Record<'get' | 'post' | 'put' | 'delete', ReturnType<typeof vi.fn>>
}

describe('createCookApi', () => {
  it('opens a Recipe with its Batch count', async () => {
    const c = client()
    await createCookApi(c).view({ kind: 'recipe', recipeId: 12, batches: 1.5 })
    expect(c.get).toHaveBeenCalledWith('/api/cook/recipes/12?batches=1.5')
  })

  it('marks an Advance Step', async () => {
    const c = client()
    await createCookApi(c).setMark('meal:2026-11-09/3/7', 0, true)
    expect(c.put).toHaveBeenCalledWith('/api/cook/marks', { scope: 'meal:2026-11-09/3/7', step: 0, done: true })
  })

  it('lists timers, optionally for a scope (URL-encoded)', async () => {
    const c = client({ get: vi.fn().mockResolvedValue({ now: 'x', timers: [] }) })
    const api = createCookApi(c)
    await api.timers()
    expect(c.get).toHaveBeenLastCalledWith('/api/cook/timers')
    await api.timers('meal:2026-11-09/3/7')
    expect(c.get).toHaveBeenLastCalledWith('/api/cook/timers?scope=meal%3A2026-11-09%2F3%2F7')
  })

  it('starts, pauses, resumes and cancels timers', async () => {
    const c = client()
    const api = createCookApi(c)
    await api.startTimer({ scope: 'recipe:12', step: 2 })
    expect(c.post).toHaveBeenLastCalledWith('/api/cook/timers', { scope: 'recipe:12', step: 2 })
    await api.pauseTimer(4)
    expect(c.post).toHaveBeenLastCalledWith('/api/cook/timers/4/pause')
    await api.resumeTimer(4)
    expect(c.post).toHaveBeenLastCalledWith('/api/cook/timers/4/resume')
    await api.cancelTimer(4)
    expect(c.delete).toHaveBeenCalledWith('/api/cook/timers/4')
  })
})
