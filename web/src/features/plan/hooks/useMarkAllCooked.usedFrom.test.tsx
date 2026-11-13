// b5-ufw (docs/dev/design/b5-ufw.md §5): useMarkAllCooked carries the Used from picks per Course.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CookPreviewWithLots } from '../api.usedFrom'
import { planStrings } from '../strings'
import { courseMeal, mockApi, wrapper } from '../test-utils'
import { usedFromStrings } from '../usedFromStrings'
import { useMarkAllCooked } from './useMarkAllCooked'

vi.mock('./useCookContext', () => ({ useCookContext: () => ({ unitSystem: 'metric', today: '2026-11-10' }) }))

afterEach(() => vi.unstubAllGlobals())

const slot = { date: '2026-11-10', mealSlotId: 2 }
const lot = (id: number, quantity: number, place: string) => ({ id, quantity, purchased: '2026-11-09', goesOff: '2026-11-14', storagePlaceName: place })
// Both Courses need Chicken thighs and see the same Lot 1 (500 g) and Lot 2 (600 g).
const preview = (courseId: number, courseName: string, lots = [lot(1, 500, 'Fridge'), lot(2, 600, 'Freezer')]): CookPreviewWithLots => ({
  meal: courseMeal(courseId, courseName, { recipeName: `R${courseId}` }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2,
  proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13',
  needs: [{ ingredientId: 11, ingredient: 'Chicken thighs', quantity: 400, baseUnit: 'g', lots }],
})
const P1 = 'GET /api/plan/2026-11-10/2/1/cook'
const P2 = 'GET /api/plan/2026-11-10/2/2/cook'
const ALL = 'POST /api/plan/2026-11-10/2/all/cooked'
const allPath = '/api/plan/2026-11-10/2/all/cooked'
const result = { meals: [], leftovers: [], warnings: [], plannedFor: [] }
const refused = { status: 422, json: { error: { code: 'used_from_invalid', message: 'A Stock Lot changed' } } }

async function loaded() {
  const hook = renderHook(() => useMarkAllCooked(slot, [1, 2]), { wrapper })
  await waitFor(() => expect(hook.result.current.rows).toHaveLength(2))
  return hook
}

describe('useMarkAllCooked: Used from', () => {
  it('offers the lines of each Course from its own preview', async () => {
    mockApi({ [P1]: preview(1, 'Main'), [P2]: preview(2, 'Side', [lot(5, 900, 'Pantry')]) })
    const { result: hook } = await loaded()
    const uf = hook.current.usedFrom
    expect(uf.lines(1)[0]!.lots.map((l) => l.lotId)).toEqual([1, 2])
    expect(uf.lines(2)[0]!.lots.map((l) => l.lotId)).toEqual([5])
    expect(uf.hasConflict).toBe(false)
  })

  it('sends no usedFrom anywhere when nothing was chosen', async () => {
    const api = mockApi({ [P1]: preview(1, 'Main'), [P2]: preview(2, 'Side'), [ALL]: result })
    const { result: hook } = await loaded()
    await act(async () => {
      await hook.current.confirm()
    })
    expect(api.callsTo('POST', allPath)[0]!.body).toEqual({
      courses: [{ courseId: 1, leftoverPortions: 2 }, { courseId: 2, leftoverPortions: 2 }],
    })
  })

  it('sends usedFrom on the Courses that chose, per Course', async () => {
    const api = mockApi({ [P1]: preview(1, 'Main'), [P2]: preview(2, 'Side'), [ALL]: result })
    const { result: hook } = await loaded()
    act(() => hook.current.usedFrom.toggle(2, 11, 2, true))
    await act(async () => {
      await hook.current.confirm()
    })
    expect(api.callsTo('POST', allPath)[0]!.body).toEqual({
      courses: [
        { courseId: 1, leftoverPortions: 2 },
        { courseId: 2, leftoverPortions: 2, usedFrom: [{ ingredientId: 11, lots: [{ lotId: 2, quantity: 400 }] }] },
      ],
    })
  })

  it('two Courses taking more from one Lot than it holds is a conflict, and confirm sends nothing', async () => {
    const api = mockApi({ [P1]: preview(1, 'Main'), [P2]: preview(2, 'Side'), [ALL]: result })
    const { result: hook } = await loaded()
    act(() => hook.current.usedFrom.toggle(1, 11, 1, true)) // 400 of the 500 g Lot
    expect(hook.current.usedFrom.hasConflict).toBe(false)
    act(() => hook.current.usedFrom.toggle(2, 11, 1, true)) // 400 + 400 > 500
    expect(hook.current.usedFrom.hasConflict).toBe(true)
    let out: unknown = 'unset'
    await act(async () => {
      out = await hook.current.confirm()
    })
    expect(out).toBeNull()
    expect(api.callsTo('POST', allPath)).toHaveLength(0)
    act(() => hook.current.usedFrom.toggle(2, 11, 1, false))
    expect(hook.current.usedFrom.hasConflict).toBe(false)
  })

  it('a 422 used_from_invalid shows the refusal copy, returns null and reloads every preview', async () => {
    let loads = 0
    const api = mockApi({
      [P1]: () => (loads++ < 2 ? preview(1, 'Main') : preview(1, 'Main', [lot(7, 800, 'Fridge')])),
      [P2]: preview(2, 'Side'),
      [ALL]: refused,
    })
    const { result: hook } = await loaded()
    act(() => hook.current.usedFrom.toggle(1, 11, 1, true))
    let out: unknown = 'unset'
    await act(async () => {
      out = await hook.current.confirm()
    })
    expect(out).toBeNull()
    expect(hook.current.error).toBe(usedFromStrings.refused)
    await waitFor(() => expect(api.callsTo('GET', '/api/plan/2026-11-10/2/1/cook')).toHaveLength(2))
    await waitFor(() => expect(api.callsTo('GET', '/api/plan/2026-11-10/2/2/cook')).toHaveLength(2))
  })

  it('any other failure keeps the generic cooked error', async () => {
    mockApi({ [P1]: preview(1, 'Main'), [P2]: preview(2, 'Side'), [ALL]: { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    const { result: hook } = await loaded()
    await act(async () => {
      await hook.current.confirm()
    })
    expect(hook.current.error).toBe(planStrings.cookedError)
  })

  describe('against a server that sends needs without baseUnit or lots', () => {
    const serverPreview = (courseId: number, courseName: string) => ({ ...preview(courseId, courseName), needs: [{ ingredientId: 11, ingredient: 'Chicken thighs', quantity: 400 }] })

    it('does not throw: no Used from lines, and Mark all Cooked still sends exactly as before', async () => {
      const api = mockApi({ [P1]: serverPreview(1, 'Main'), [P2]: serverPreview(2, 'Side'), [ALL]: result })
      const { result: hook } = await loaded()
      expect(hook.current.usedFrom.lines(1)).toEqual([])
      expect(hook.current.usedFrom.lines(2)).toEqual([])
      expect(hook.current.usedFrom.hasConflict).toBe(false)
      await act(async () => {
        await hook.current.confirm()
      })
      const body = api.callsTo('POST', allPath)[0]!.body as { courses: Array<{ usedFrom?: unknown }> }
      expect(body.courses.map((c) => c.usedFrom)).toEqual([undefined, undefined])
    })
  })
})
