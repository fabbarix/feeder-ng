import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../../settings/test-utils'
import * as seams from '../seams'
import { useAdvanceStepsDue, useToday } from './useToday'

vi.mock('../seams', () => ({
  useScanSessionActive: vi.fn(() => false),
  useTodayPlan: vi.fn(() => ({ hasNextMeal: false, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false })),
  useTodayStock: vi.fn(() => ({ spoiled: 0, useSoon: [], loading: false })),
}))

const step = {
  mealDate: '2026-11-09',
  mealSlotId: 3,
  recipeName: 'Chicken curry',
  description: 'Marinate the chicken',
  dueAt: '2026-11-09T14:30:00Z',
  dueTime: '15:30',
  slotTime: '19:30',
  state: 'due',
}

beforeEach(() => {
  // Reset every seam: a value set by one test must not leak into the next (vitest keeps mockReturnValue).
  vi.mocked(seams.useScanSessionActive).mockReturnValue(false)
  vi.mocked(seams.useTodayPlan).mockReturnValue({ hasNextMeal: false, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false })
  vi.mocked(seams.useTodayStock).mockReturnValue({ spoiled: 0, useSoon: [], loading: false })
})
afterEach(() => vi.unstubAllGlobals())

describe('useToday', () => {
  it('composes the layout from seam counts, Advance Steps and the streak', async () => {
    vi.mocked(seams.useTodayPlan).mockReturnValue({ hasNextMeal: true, toConfirm: 1, couldntPlan: 0, leftovers: 2, loading: false })
    vi.mocked(seams.useTodayStock).mockReturnValue({ spoiled: 1, useSoon: [], loading: false })
    mockApi({ 'GET /api/today/advance-steps': { steps: [step] }, 'GET /api/today/streak': { days: 4 } })
    const { result } = renderHook(() => useToday(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const layout = result.current.layout
    expect(layout.mode).toBe('today')
    if (layout.mode === 'today') {
      expect(layout.tiles.map((t) => t.id)).toEqual(['nextMeal', 'spoiled', 'advanceSteps', 'toConfirm', 'leftovers', 'streak'])
    }
  })

  it('is the Shopping List while a scan session is active', async () => {
    vi.mocked(seams.useScanSessionActive).mockReturnValue(true)
    mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } })
    const { result } = renderHook(() => useToday(), { wrapper })
    await waitFor(() => expect(result.current.layout).toEqual({ mode: 'shopping' }))
  })

  it('is loading until the plan, stock and own queries have answered', async () => {
    vi.mocked(seams.useTodayPlan).mockReturnValue({ hasNextMeal: false, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: true })
    mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } })
    const { result } = renderHook(() => useToday(), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.loading).toBe(true)
  })

  it('treats a failing own endpoint as nothing to show rather than breaking Today', async () => {
    vi.mocked(seams.useTodayPlan).mockReturnValue({ hasNextMeal: true, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false })
    mockApi({
      'GET /api/today/advance-steps': { status: 500, json: { error: { code: 'boom', message: 'x' } } },
      'GET /api/today/streak': { status: 500, json: { error: { code: 'boom', message: 'x' } } },
    })
    const { result } = renderHook(() => useToday(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const layout = result.current.layout
    expect(layout.mode === 'today' && layout.tiles.map((t) => t.id)).toEqual(['nextMeal'])
  })
})

describe('useAdvanceStepsDue', () => {
  it('returns the steps from the server in order', async () => {
    mockApi({ 'GET /api/today/advance-steps': { steps: [step, { ...step, description: 'Prove the dough', state: 'upcoming' }] } })
    const { result } = renderHook(() => useAdvanceStepsDue(), { wrapper })
    await waitFor(() => expect(result.current.steps).toHaveLength(2))
    expect(result.current.steps[1]?.description).toBe('Prove the dough')
  })
})
