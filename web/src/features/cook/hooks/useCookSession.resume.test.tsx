// B9-25 (PC-04): Cook Mode reopens at the last Step shown. useCookSession reads feeder.cook.resume.<scope> once the Steps are in,
// opens on that Step (a finished timer's "after" = the next Step), saves the Step on every next/back, and clears it on Cooked.
// The Step is the CookStep.index (what a timer's `step` holds). See lib/resume.test.ts for the storage format.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { CookSource, CookView } from '../types'

const api = vi.hoisted(() => ({ view: vi.fn(), setMark: vi.fn(), startTimer: vi.fn() }))
vi.mock('../api', () => ({ cookApi: api }))
vi.mock('../../../lib/sse', () => ({ connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }) }))

import { useCookSession } from './useCookSession'

const KEY = 'feeder.cook.resume.meal:2026-11-09/3/1'
const step = (index: number, number: number, text: string, timer: { label: string; durationSeconds: number } | null = null) => ({
  index, number, of: 4, kind: timer ? ('passive' as const) : ('active' as const), text, durationMinutes: 5, imageUrl: '', uses: [], timer,
})
const view: CookView = {
  scope: 'meal:2026-11-09/3/1', recipeId: 12, recipeName: 'Chicken stew', batches: 1, meal: { date: '2026-11-09', mealSlotId: 3 }, today: '2026-11-09', advance: [],
  steps: [step(1, 1, 'Chop the onions'), step(2, 2, 'Simmer the stew', { label: 'Step 2: Simmer the stew', durationSeconds: 2700 }), step(4, 3, 'Season'), step(5, 4, 'Plate up')],
  timers: [],
}
const source: CookSource = { kind: 'meal', date: '2026-11-09', mealSlotId: 3, courseId: 1 }
const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
const open = async () => {
  const hook = renderHook(() => useCookSession(source), { wrapper: wrapper() })
  await waitFor(() => expect(hook.result.current.step).not.toBeNull())
  return hook
}

beforeEach(() => {
  window.localStorage.removeItem(KEY)
  Object.values(api).forEach((f) => f.mockReset())
  api.view.mockResolvedValue(view)
  api.startTimer.mockResolvedValue({})
})
afterEach(() => window.localStorage.removeItem(KEY))

describe('useCookSession resume (PC-04)', () => {
  it('nothing stored: opens on the first Step, as before', async () => {
    const { result } = await open()
    expect(result.current.step?.text).toBe('Chop the onions')
  })

  it('Tapping the timer pill reopens Cook Mode at the Step I left: the stored Step is the one on screen', async () => {
    window.localStorage.setItem(KEY, '4')
    const { result } = await open()
    expect(result.current.step?.text).toBe('Season')
    expect(result.current.nav.index).toBe(2)
    expect(result.current.isFirst).toBe(false)
  })

  it('from a finished timer ("<step>+") it opens on the Step after it', async () => {
    window.localStorage.setItem(KEY, '2+')
    const { result } = await open()
    expect(result.current.step?.text).toBe('Season')
  })

  it('a stored Step that is no longer in the Recipe opens the first Step', async () => {
    window.localStorage.setItem(KEY, '3')
    const { result } = await open()
    expect(result.current.step?.text).toBe('Chop the onions')
  })

  it('garbage in storage opens the first Step', async () => {
    window.localStorage.setItem(KEY, 'abc')
    const { result } = await open()
    expect(result.current.step?.text).toBe('Chop the onions')
  })

  it('the stored Step is applied once: a refetch of the view does not pull the cook back', async () => {
    window.localStorage.setItem(KEY, '2')
    const { result } = await open()
    expect(result.current.step?.text).toBe('Simmer the stew')
    act(() => result.current.next())
    expect(result.current.step?.text).toBe('Season')
    api.view.mockResolvedValue({ ...view, today: '2026-11-10' })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(result.current.step?.text).toBe('Season')
  })

  it('next and back save the Step now on screen (its index, not its position)', async () => {
    const { result } = await open()
    act(() => result.current.next())
    expect(window.localStorage.getItem(KEY)).toBe('2')
    act(() => result.current.next())
    expect(window.localStorage.getItem(KEY)).toBe('4')
    act(() => result.current.back())
    expect(window.localStorage.getItem(KEY)).toBe('2')
  })

  it('an "after" mark is replaced by the plain Step as soon as the cook moves (it was a one-time hand-off from the timer)', async () => {
    window.localStorage.setItem(KEY, '2+')
    const { result } = await open()
    act(() => result.current.next())
    expect(window.localStorage.getItem(KEY)).toBe('5')
  })

  it('opening on a Step saves it too (a reload before the first tap resumes there)', async () => {
    window.localStorage.setItem(KEY, '2+')
    await open()
    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBe('4'))
  })

  it('clearResume() forgets the Step (the screen calls it after Mark as Cooked)', async () => {
    window.localStorage.setItem(KEY, '4')
    const { result } = await open()
    act(() => result.current.clearResume())
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('stays cleared: leaving a Cooked meal does not save the Step again (nothing is saved after clearResume until the cook moves)', async () => {
    const { result } = await open()
    act(() => result.current.next())
    act(() => result.current.clearResume())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('a Planned Meal that is already cooked (409 not_cookable) clears the Step', async () => {
    window.localStorage.setItem(KEY, '4')
    api.view.mockRejectedValue(new ApiError(409, 'not_cookable', 'already cooked'))
    const { result } = renderHook(() => useCookSession(source), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.notCookable).toBe(true))
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('a Recipe session keeps its own Step under recipe:<id>', async () => {
    window.localStorage.removeItem('feeder.cook.resume.recipe:12')
    window.localStorage.setItem('feeder.cook.resume.recipe:12', '4')
    api.view.mockResolvedValue({ ...view, scope: 'recipe:12', meal: null })
    const hook = renderHook(() => useCookSession({ kind: 'recipe', recipeId: 12, batches: 1 }), { wrapper: wrapper() })
    await waitFor(() => expect(hook.result.current.step).not.toBeNull())
    expect(hook.result.current.step?.text).toBe('Season')
    window.localStorage.removeItem('feeder.cook.resume.recipe:12')
  })

  it('a Recipe session cooked with 2 Batches stores them beside the Step (ruling 3: the pill reopens the same Batches)', async () => {
    window.localStorage.removeItem('feeder.cook.resume.recipe:12')
    api.view.mockResolvedValue({ ...view, scope: 'recipe:12', meal: null, batches: 2 })
    const hook = renderHook(() => useCookSession({ kind: 'recipe', recipeId: 12, batches: 2 }), { wrapper: wrapper() })
    await waitFor(() => expect(hook.result.current.step).not.toBeNull())
    await waitFor(() => expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('1@2'))
    act(() => hook.result.current.next())
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('2@2')
    window.localStorage.removeItem('feeder.cook.resume.recipe:12')
  })

  it('a stored value with Batches still opens on its Step ("4+@2" opens after Step 4)', async () => {
    window.localStorage.setItem('feeder.cook.resume.recipe:12', '4+@2')
    api.view.mockResolvedValue({ ...view, scope: 'recipe:12', meal: null, batches: 2 })
    const hook = renderHook(() => useCookSession({ kind: 'recipe', recipeId: 12, batches: 2 }), { wrapper: wrapper() })
    await waitFor(() => expect(hook.result.current.step).not.toBeNull())
    expect(hook.result.current.step?.text).toBe('Plate up')
    window.localStorage.removeItem('feeder.cook.resume.recipe:12')
  })

  it('a Planned Meal Course stores no Batches (its Course sets them)', async () => {
    await open()
    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBe('1'))
  })

  it('blocked storage: opens on the first Step and walking still works', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      const { result } = await open()
      expect(result.current.step?.text).toBe('Chop the onions')
      act(() => result.current.next())
      expect(result.current.step?.text).toBe('Simmer the stew')
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })
})
