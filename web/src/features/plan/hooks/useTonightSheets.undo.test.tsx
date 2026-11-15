// B9-26 (PC-01): Today's Tonight sheets show What changed too: its Swap and Choose a Recipe go through the same writes, another User's edit
// is announced (once, by this hook), and the Review controller is handed to the screen (TodayScreen mounts <ReplanReviewSheet>: an edit outside B9-26's files).
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { meal, mockApi } from '../test-utils'
import { dinnerChange, findToastWith, lunchChange, pressInToast, seededClient, WEEK, wrapperFor } from '../test-utils.undo'
import { useTonightSheets } from './useTonightSheets'

beforeEach(() => {
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  vi.stubGlobal('EventSource', class {})
})
afterEach(() => vi.unstubAllGlobals())

const key = { date: '2026-11-17', mealSlotId: 1, courseId: 1 }
const written = { ...meal({ date: '2026-11-17', mealSlotId: 1, recipeId: 21, pinned: true }), changes: [lunchChange, dinnerChange], undoToken: 'tok-1' }

function setup() {
  const Wrapper = wrapperFor(seededClient())
  return renderHook(() => useTonightSheets(WEEK[2]!), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Wrapper>
        <MemoryRouter>{children}</MemoryRouter>
      </Wrapper>
    ),
  })
}

describe('useTonightSheets: What changed on Today', () => {
  it('Swap: the pick shows "Swapped Tue Breakfast" with Review and Undo', async () => {
    mockApi({ 'GET /api/plan/2026-11-17/1/1/alternatives': { alternatives: [] }, 'PUT /api/plan/2026-11-17/1/1': written })
    const { result } = setup()
    act(() => result.current.swap.open(key))
    await act(async () => void (await result.current.swap.pick(21)))
    const toast = await findToastWith('Swapped Tue Breakfast')
    expect([...toast.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toContain('Review 2 changed meals')
  })

  it('Choose a Recipe: "Recipe chosen for Tue Breakfast"', async () => {
    mockApi({ 'PUT /api/plan/2026-11-17/1/1': written })
    const { result } = setup()
    act(() => result.current.choose.open(key))
    await act(async () => void (await result.current.choose.pick(21)))
    expect(await findToastWith('Recipe chosen for Tue Breakfast')).toBeTruthy()
  })

  it('hands the Review controller to the screen: Review in the toast opens it', async () => {
    mockApi({ 'GET /api/plan/2026-11-17/1/1/alternatives': { alternatives: [] }, 'PUT /api/plan/2026-11-17/1/1': written })
    const { result } = setup()
    act(() => result.current.swap.open(key))
    await act(async () => void (await result.current.swap.pick(21)))
    await pressInToast(await findToastWith('Swapped Tue Breakfast'), 'Review 2 changed meals')
    await waitFor(() => expect(result.current.review.open).toBe(true))
  })

  it("announces another User's edit, once", async () => {
    mockApi({})
    setup()
    act(() => void sse.handlers['plan']?.forEach((h) => h({ changed: 'plan', reason: 'pinned', by: { userId: 2, name: 'Anna' }, target: key, changes: [lunchChange] })))
    await findToastWith('Anna changed Tue Breakfast')
    expect(document.querySelectorAll('.toast')).toHaveLength(1)
  })
})
