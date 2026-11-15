// B9-26 (PC-01): another User's edit shows What changed, with Review and no Undo (the plan event never carries the token).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dinnerChange, findToastWith, lunchChange, noToast, pressInToast, seededClient, wrapperFor } from '../test-utils.undo'

const sse = vi.hoisted(() => {
  const handlers: Record<string, ((data?: unknown) => void)[]> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: (data?: unknown) => void) => {
      ;(handlers[topic] ??= []).push(handler)
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { useReplanReview } from './useReplanReview'
import { usePlanLiveUpdates } from './usePlanLiveUpdates'

beforeEach(() => {
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  vi.stubGlobal('EventSource', class {})
})
afterEach(() => vi.unstubAllGlobals())

const emit = (data: unknown) => act(() => void sse.handlers['plan']?.forEach((h) => h(data)))
const anna = { userId: 2, name: 'Anna' }
const event = (over: Record<string, unknown> = {}) => ({
  changed: 'plan', reason: 'pinned', by: anna, target: { date: '2026-11-17', mealSlotId: 3, courseId: 1 }, changes: [lunchChange, dinnerChange], ...over,
})

function setup() {
  const client = seededClient()
  const view = renderHook(
    () => {
      usePlanLiveUpdates({ announce: true })
      return useReplanReview()
    },
    { wrapper: wrapperFor(client) },
  )
  return { client, ...view }
}

describe('usePlanLiveUpdates({ announce: true })', () => {
  it('shows what another User changed: who, how many, which meals, and Review only (no Undo, no token)', async () => {
    setup()
    emit(event())
    const toast = await findToastWith('Anna changed Tue Dinner')
    expect(toast).toHaveTextContent('2 other meals changed')
    expect(toast).toHaveTextContent('Tue Lunch is now Chicken curry. Wed Dinner is now Lentil soup.')
    expect([...toast.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Review 2 changed meals', 'Dismiss'])
  })

  it('still refetches the plan', async () => {
    const { client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    emit(event())
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['plan'] }))
  })

  it('Review opens the sheet for those changes, worded for Anna, with no Undo all; the rows are marked until then', async () => {
    const { result } = setup()
    emit(event())
    await waitFor(() => expect(Object.keys(result.current.marks)).toHaveLength(2))
    await pressInToast(await findToastWith('Anna changed Tue Dinner'), 'Review 2 changed meals')
    await waitFor(() => expect(result.current.open).toBe(true))
    expect(result.current.model?.context).toBe("After Anna's change · 2 other meals")
    expect(result.current.canUndo).toBe(false)
    expect(result.current.marks).toEqual({})
  })

  it('says nothing about your own write (the toast of your own request already did)', async () => {
    setup()
    emit(event({ by: { userId: 1, name: 'Sam' } }))
    await Promise.resolve()
    noToast()
  })

  it('says nothing for a change the planner made by itself (no `by`), or one that moved no other meal', async () => {
    setup()
    emit(event({ by: undefined }))
    emit(event({ changes: [] }))
    emit({ changed: 'plan', reason: 'nightly' })
    await Promise.resolve()
    noToast()
  })

  it('a second event replaces the first toast', async () => {
    setup()
    emit(event())
    await findToastWith('Anna changed Tue Dinner')
    emit(event({ reason: 'unpinned', target: { date: '2026-11-17', mealSlotId: 1, courseId: 1 }, changes: [lunchChange] }))
    await findToastWith('Anna unpinned Tue Breakfast')
    expect(document.querySelectorAll('.toast')).toHaveLength(1)
  })
})

describe('usePlanLiveUpdates() without announce (usePlan, the Today tiles)', () => {
  it('refetches only: it needs no Toast and no signed-in User, and shows nothing', () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => usePlanLiveUpdates(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
    emit(event())
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['plan'] }))
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['today', 'streak'] }))
    noToast()
  })
})
