// CRS C3: Cook Mode opens a Recipe through view() and a Planned Meal only through a named Course (docs/dev/design/crs-c3.md 4).
import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '../../lib/http'
import { createCookApi } from './api'
import { routes } from './index'

const client = () => ({ get: vi.fn().mockResolvedValue({}), post: vi.fn(), put: vi.fn(), delete: vi.fn() }) as unknown as HttpClient & { get: ReturnType<typeof vi.fn> }

describe('createCookApi without the two-part route', () => {
  it('view() no longer opens a Planned Meal: the two-part route answers 404', async () => {
    const c = client()
    await Promise.resolve()
      .then(() => createCookApi(c).view({ kind: 'meal', date: '2026-11-10', mealSlotId: 4 } as never))
      .catch(() => undefined)
    expect(c.get.mock.calls.map((x) => x[0])).not.toContain('/api/cook/meals/2026-11-10/4')
  })

  it('view() still opens a Recipe', async () => {
    const c = client()
    await createCookApi(c).view({ kind: 'recipe', recipeId: 12, batches: 1.5 })
    expect(c.get).toHaveBeenCalledWith('/api/cook/recipes/12?batches=1.5')
  })

  it('courseView() and timeline() are the Planned Meal routes', async () => {
    const c = client()
    await createCookApi(c).courseView('2026-11-10', 4, 2)
    await createCookApi(c).timeline('2026-11-10', 4)
    expect(c.get.mock.calls.map((x) => x[0])).toEqual(['/api/cook/meals/2026-11-10/4/2', '/api/cook/meals/2026-11-10/4/all'])
  })
})

describe('the Cook routes', () => {
  it('the Reheat screen is only reachable with its Course: /cook/reheat/:date/:slotId is gone', () => {
    const paths = routes.map((r) => r.path)
    expect(paths).not.toContain('/cook/reheat/:date/:slotId')
    expect(paths).toContain('/cook/reheat/:date/:slotId/:courseId')
  })

  it('the cooking timeline of a slot stays', () => {
    const paths = routes.map((r) => r.path)
    expect(paths).toContain('/cook/meal/:date/:slotId')
    expect(paths).toContain('/cook/meal/:date/:slotId/:courseId')
  })
})
