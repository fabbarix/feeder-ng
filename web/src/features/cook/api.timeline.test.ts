// CRS F: the cook routes of the timeline (crs-c2.md 5.1 and 5.2).
import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '../../lib/http'
import { createCookApi } from './api'

function client() {
  return { get: vi.fn().mockResolvedValue({}), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as HttpClient & { get: ReturnType<typeof vi.fn> }
}

describe('createCookApi: the timeline', () => {
  it('timeline GETs the slot\'s combined cooking timeline', async () => {
    const c = client()
    await createCookApi(c).timeline('2026-11-10', 4)
    expect(c.get).toHaveBeenCalledWith('/api/cook/meals/2026-11-10/4/all')
  })

  it('courseView GETs one Course\'s own view', async () => {
    const c = client()
    await createCookApi(c).courseView('2026-11-10', 4, 2)
    expect(c.get).toHaveBeenCalledWith('/api/cook/meals/2026-11-10/4/2')
  })

  it('the old two-part meal view is unchanged (the main Course alias, until C3)', async () => {
    const c = client()
    await createCookApi(c).view({ kind: 'meal', date: '2026-11-10', mealSlotId: 4 })
    expect(c.get).toHaveBeenCalledWith('/api/cook/meals/2026-11-10/4')
  })
})
