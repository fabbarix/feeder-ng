// useSlotPreview (CRS D2): the dry run behind "Removes Side from Tue and Thu: ...".
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SlotBatchRequest, SlotBatchResult, SlotRemoves } from '../types'
import { useSlotPreview } from './useSlotPreview'

const request = (ids: number[]): SlotBatchRequest => ({ match: 'Dinner', weekdays: [2, 4], set: { courses: ids.map((id) => ({ id, optional: false, optOutMemberIds: [] })) } })
const removes: SlotRemoves = { plannedMeals: [], slotRules: [] }
const answer = (r: SlotRemoves = removes): SlotBatchResult => ({ match: 'Dinner', updated: [], skipped: [], removes: r })

describe('useSlotPreview', () => {
  it('does nothing for a null request', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useSlotPreview(null, run))
    expect(result.current).toEqual({ status: 'idle', removes: undefined })
    expect(run).not.toHaveBeenCalled()
  })

  it('runs the request as a dry run and answers its removes', async () => {
    const run = vi.fn().mockResolvedValue(answer())
    const { result } = renderHook(() => useSlotPreview(request([1]), run))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.removes).toEqual(removes)
    expect(run).toHaveBeenCalledWith({ ...request([1]), dryRun: true })
  })

  it('runs again for a different request, not for an equal one', async () => {
    const run = vi.fn().mockResolvedValue(answer())
    const { result, rerender } = renderHook(({ r }) => useSlotPreview(r, run), { initialProps: { r: request([1]) } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ r: request([1]) })
    expect(run).toHaveBeenCalledTimes(1)
    rerender({ r: request([1, 2]) })
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2))
  })

  it('drops an older answer that arrives after a newer request', async () => {
    const slow: { resolve: (r: SlotBatchResult) => void } = { resolve: () => {} }
    const mine: SlotRemoves = { plannedMeals: [], slotRules: [{ id: 1, mealSlotId: 1, mealSlotName: 'Dinner', courseId: 2, courseName: 'Side', tag: 'x' }] }
    const run = vi
      .fn()
      .mockImplementationOnce(() => new Promise<SlotBatchResult>((resolve) => (slow.resolve = resolve)))
      .mockResolvedValueOnce(answer(mine))
    const { result, rerender } = renderHook(({ r }) => useSlotPreview(r, run), { initialProps: { r: request([1]) } })
    rerender({ r: request([1, 2]) })
    await waitFor(() => expect(result.current.removes).toEqual(mine))
    await act(async () => slow.resolve(answer()))
    expect(result.current.removes).toEqual(mine)
  })

  it('is an error when the dry run is refused, and idle again for a null request', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'))
    const { result, rerender } = renderHook(({ r }) => useSlotPreview(r, run), { initialProps: { r: request([1]) as SlotBatchRequest | null } })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.removes).toBeUndefined()
    rerender({ r: null })
    expect(result.current.status).toBe('idle')
  })
})
