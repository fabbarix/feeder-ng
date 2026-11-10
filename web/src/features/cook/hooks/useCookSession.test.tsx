import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { CookSource, CookView } from '../types'

const api = vi.hoisted(() => ({ view: vi.fn(), setMark: vi.fn(), startTimer: vi.fn() }))
vi.mock('../api', () => ({ cookApi: api }))
vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

import { useCookSession } from './useCookSession'

const view: CookView = {
  scope: 'meal:2026-11-09/3',
  recipeId: 12,
  recipeName: 'Chicken stew',
  batches: 2,
  meal: { date: '2026-11-09', mealSlotId: 3 },
  advance: [
    { step: 0, text: 'Marinate the chicken', leadTimeMinutes: 240, done: true, doneAt: '2026-11-09T08:00:00Z', warning: false },
    { step: 3, text: 'Soak the beans', leadTimeMinutes: 480, done: false, doneAt: null, warning: true },
  ],
  steps: [
    { index: 1, number: 1, of: 3, kind: 'active', text: 'Chop the onions', durationMinutes: 10, imageUrl: '', uses: [{ ingredientId: 1, ingredient: 'onion', quantity: 4, unit: 'piece' }], timer: null },
    { index: 2, number: 2, of: 3, kind: 'passive', text: 'Simmer the stew', durationMinutes: 45, imageUrl: '', uses: [], timer: { label: 'Step 2: Simmer the stew', durationSeconds: 2700 } },
    { index: 4, number: 3, of: 3, kind: 'active', text: 'Plate up', durationMinutes: 5, imageUrl: '', uses: [], timer: null },
  ],
  timers: [],
}
const source: CookSource = { kind: 'meal', date: '2026-11-09', mealSlotId: 3 }

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { Wrapper }
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.view.mockResolvedValue(view)
  api.setMark.mockResolvedValue({ scope: view.scope, step: 3, done: true, doneAt: '2026-11-09T12:00:00Z' })
  api.startTimer.mockResolvedValue({})
})

describe('useCookSession', () => {
  it('opens on the first Step with the Advance Steps split into done and pending', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useCookSession(source), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.step).not.toBeNull())
    expect(api.view).toHaveBeenCalledWith(source)
    expect(result.current.step?.text).toBe('Chop the onions')
    expect(result.current.isFirst).toBe(true)
    expect(result.current.isLast).toBe(false)
    expect(result.current.scope).toBe('meal:2026-11-09/3')
    expect(result.current.advance.done.map((a) => a.text)).toEqual(['Marinate the chicken'])
    expect(result.current.advance.pending.map((a) => a.text)).toEqual(['Soak the beans'])
    expect(result.current.markCookedKey).toEqual({ date: '2026-11-09', mealSlotId: 3 })
  })

  it('walks the Steps with next and back and stops at the ends', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useCookSession(source), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.step).not.toBeNull())
    act(() => result.current.back())
    expect(result.current.nav.index).toBe(0)
    act(() => result.current.next())
    act(() => result.current.next())
    expect(result.current.step?.text).toBe('Plate up')
    expect(result.current.isLast).toBe(true)
    act(() => result.current.next())
    expect(result.current.nav.index).toBe(2)
    act(() => result.current.back())
    expect(result.current.step?.text).toBe('Simmer the stew')
  })

  it('starts a Passive Step timer when the Step is reached, once per Step', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useCookSession(source), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.step).not.toBeNull())
    expect(api.startTimer).not.toHaveBeenCalled()
    act(() => result.current.next()) // reaches Simmer the stew
    await waitFor(() => expect(api.startTimer).toHaveBeenCalledTimes(1))
    expect(api.startTimer).toHaveBeenCalledWith({ scope: 'meal:2026-11-09/3', step: 2 })
    act(() => result.current.next())
    act(() => result.current.back())
    act(() => result.current.back())
    act(() => result.current.next())
    expect(api.startTimer).toHaveBeenCalledTimes(1)
  })

  it('repeat bumps a counter and leaves the Step alone', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useCookSession(source), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.step).not.toBeNull())
    act(() => result.current.repeat())
    expect(result.current.repeatCount).toBe(1)
    expect(result.current.nav.index).toBe(0)
  })

  it('marks an Advance Step done through the API and refreshes the view', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useCookSession(source), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.step).not.toBeNull())
    await act(async () => result.current.markAdvanceDone(3))
    expect(api.setMark).toHaveBeenCalledWith('meal:2026-11-09/3', 3, true)
    await waitFor(() => expect(api.view).toHaveBeenCalledTimes(2))
  })

  it('a Recipe scope has no Planned Meal to mark as cooked', async () => {
    api.view.mockResolvedValue({ ...view, scope: 'recipe:12', meal: null })
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useCookSession({ kind: 'recipe', recipeId: 12, batches: 2 }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.step).not.toBeNull())
    expect(result.current.markCookedKey).toBeNull()
  })

  it('a Recipe with no Steps is first and last at once', async () => {
    api.view.mockResolvedValue({ ...view, steps: [] })
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useCookSession(source), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.view).toBeDefined())
    expect(result.current.step).toBeNull()
    expect(result.current.isLast).toBe(true)
  })

  it('a first Step that is Passive starts its timer at once', async () => {
    api.view.mockResolvedValue({ ...view, steps: [view.steps[1]!] })
    const { Wrapper } = wrapper()
    renderHook(() => useCookSession(source), { wrapper: Wrapper })
    await waitFor(() => expect(api.startTimer).toHaveBeenCalledWith({ scope: 'meal:2026-11-09/3', step: 2 }))
  })

  it('reports a meal that is no longer cookable', async () => {
    api.view.mockRejectedValue(new ApiError(409, 'not_cookable', 'already cooked'))
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useCookSession(source), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.notCookable).toBe(true))
    expect(result.current.step).toBeNull()
  })
})
