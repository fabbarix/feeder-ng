// CRS F review (spec 8): a failed Mark all Cooked leaves no stale error behind when the same slot is opened again.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allCookedResult, courseMeal, mockApi, wrapper } from '../test-utils'
import type { CookPreview } from '../types'
import { useAllCookedFlow } from './useAllCookedFlow'

afterEach(() => vi.unstubAllGlobals())

const slotKey = { date: '2026-11-10', mealSlotId: 2 }
const preview = (courseId: number, courseName: string): CookPreview => ({
  meal: courseMeal(courseId, courseName, { recipeName: 'R' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [],
})
const routes = { 'GET /api/plan/2026-11-10/2/1/cook': preview(1, 'Main'), 'GET /api/plan/2026-11-10/2/2/cook': preview(2, 'Side') }

describe('useAllCookedFlow: error and result are per opening of the sheet', () => {
  it('closing and reopening the same slot after a failed confirm clears the old error', async () => {
    mockApi({ ...routes, 'POST /api/plan/2026-11-10/2/all/cooked': { status: 500, json: { error: { code: 'boom', message: 'x' } } } })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    act(() => result.current.open(slotKey, [1, 2]))
    await waitFor(() => expect(result.current.controller.rows).toHaveLength(2))
    await act(async () => {
      await result.current.confirm()
    })
    expect(result.current.controller.error).toBe('That could not be saved. Nothing was changed.')
    act(() => result.current.close())
    act(() => result.current.open(slotKey, [1, 2]))
    expect(result.current.controller.error).toBeNull()
    await waitFor(() => expect(result.current.controller.rows).toHaveLength(2))
    expect(result.current.controller.error).toBeNull()
  })

  it('reopening also forgets the edited Leftovers of the failed attempt', async () => {
    mockApi({ ...routes, 'POST /api/plan/2026-11-10/2/all/cooked': { status: 500, json: { error: { code: 'boom', message: 'x' } } } })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    act(() => result.current.open(slotKey, [1, 2]))
    await waitFor(() => expect(result.current.controller.rows).toHaveLength(2))
    act(() => result.current.controller.setLeftover(1, 0.5))
    act(() => result.current.close())
    act(() => result.current.open(slotKey, [1, 2]))
    await waitFor(() => expect(result.current.controller.rows).toHaveLength(2))
    expect(result.current.controller.rows[0]!.leftover).toBe(2)
  })

  it('a successful confirm keeps its result and warnings after the sheet closes (the notices stay on screen)', async () => {
    mockApi({ ...routes, 'POST /api/plan/2026-11-10/2/all/cooked': allCookedResult() })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    act(() => result.current.open(slotKey, [1, 2]))
    await waitFor(() => expect(result.current.controller.rows).toHaveLength(2))
    await act(async () => {
      await result.current.confirm()
    })
    expect(result.current.key).toBeNull()
    expect(result.current.controller.warnings.map((w) => w.ingredientId)).toEqual([11])
  })

  it('opening the sheet again after a success starts a new one: the old warnings are gone', async () => {
    mockApi({ ...routes, 'POST /api/plan/2026-11-10/2/all/cooked': allCookedResult() })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    act(() => result.current.open(slotKey, [1, 2]))
    await waitFor(() => expect(result.current.controller.rows).toHaveLength(2))
    await act(async () => {
      await result.current.confirm()
    })
    act(() => result.current.open(slotKey, [1, 2]))
    expect(result.current.controller.warnings).toEqual([])
    expect(result.current.controller.result).toBeNull()
  })
})
