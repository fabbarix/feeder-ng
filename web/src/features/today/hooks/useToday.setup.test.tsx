import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../../settings/test-utils'
import { setupChecklist, type SetupFacts } from '../lib/setup'
import * as seams from '../seams'
import * as setupSeam from '../setupSeam'
import { useToday } from './useToday'

vi.mock('../seams', () => ({
  useScanSessionActive: vi.fn(() => false),
  useTodayPlan: vi.fn(),
  useTodayStock: vi.fn(() => ({ spoiled: 0, useSoon: [], loading: false })),
}))
vi.mock('../shopSeam', () => ({ useLinesToGet: vi.fn(() => ({ count: 0, loading: false })) })) // DS-TODAY: Lines to get
vi.mock('../setupSeam', () => ({ useSetupFacts: vi.fn() }))

const plan = (couldntPlan: number, loading = false) => ({ today: '2026-11-10', hasNextMeal: false, toConfirm: 0, couldntPlan, leftovers: 0, loading })
const fresh: SetupFacts = { members: 0, mealSlots: 0, mealSlotsWithAttendance: 0, recipes: 0, plannedMeals: 0, unplannedMeals: 0 }

beforeEach(() => {
  vi.mocked(seams.useTodayPlan).mockReturnValue(plan(0))
  vi.mocked(setupSeam.useSetupFacts).mockReturnValue({ facts: null, loading: false })
  mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } })
})
afterEach(() => vi.unstubAllGlobals())

const tileIds = (r: ReturnType<typeof useToday>) => (r.layout.mode === 'today' ? r.layout.tiles.map((t) => t.id) : [])

describe('useToday: first run (R13)', () => {
  it('a new household sees the setup checklist, not the empty state and not Couldn\'t plan', async () => {
    vi.mocked(seams.useTodayPlan).mockReturnValue(plan(9))
    vi.mocked(setupSeam.useSetupFacts).mockReturnValue({ facts: { ...fresh, unplannedMeals: 9 }, loading: false })
    const { result } = renderHook(() => useToday(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(tileIds(result.current)).toEqual(['setup'])
    expect(result.current.layout).toMatchObject({ empty: false })
  })

  it('once everything is set up, Couldn\'t plan comes back for real conflicts', async () => {
    vi.mocked(seams.useTodayPlan).mockReturnValue(plan(2))
    vi.mocked(setupSeam.useSetupFacts).mockReturnValue({ facts: { members: 2, mealSlots: 3, mealSlotsWithAttendance: 3, recipes: 4, plannedMeals: 0, unplannedMeals: 2 }, loading: false })
    const { result } = renderHook(() => useToday(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(tileIds(result.current)).toEqual(['couldntPlan'])
  })

  it('an established household never sees the checklist', async () => {
    vi.mocked(setupSeam.useSetupFacts).mockReturnValue({ facts: { members: 2, mealSlots: 3, mealSlotsWithAttendance: 3, recipes: 4, plannedMeals: 5, unplannedMeals: 0 }, loading: false })
    const { result } = renderHook(() => useToday(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(tileIds(result.current)).not.toContain('setup')
  })

  it('is loading while the setup facts load, so the empty state never flashes', async () => {
    vi.mocked(setupSeam.useSetupFacts).mockReturnValue({ facts: null, loading: true })
    const { result } = renderHook(() => useToday(), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.loading).toBe(true)
  })

  it('the checklist visibility is the lib\'s decision', () => {
    expect(setupChecklist(fresh).visible).toBe(true)
  })
})
