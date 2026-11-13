// "From the freezer": the pick is a PUT with the Leftover id; a refusal is a toast and the plan refetches either way.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { mockApi } from '../test-utils'
import { usePickLeftover } from './usePickLeftover'

afterEach(() => vi.unstubAllGlobals())
const key = { date: '2026-11-12', mealSlotId: 2, courseId: 1 }
const chilli = { id: 5, recipeName: 'Chilli' }
const setup = () => {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(c, 'invalidateQueries')
  const hook = renderHook(() => usePickLeftover(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={c}><ToastProvider>{children}</ToastProvider></QueryClientProvider> })
  return { ...hook, spy }
}

describe('usePickLeftover', () => {
  it('PUTs {leftoverId} to the Course and refreshes the plan', async () => {
    const api = mockApi({ 'PUT /api/plan/2026-11-12/2/1': { recipeId: 10 } })
    const { result, spy } = setup()
    let ok = false
    await act(async () => { ok = await result.current(key, chilli) })
    expect(ok).toBe(true)
    expect(api.calls[0]!.body).toEqual({ leftoverId: 5 })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['plan', 'view'] }))
  })
  it('a refusal toasts the reason, refetches and resolves false', async () => {
    mockApi({ 'PUT /api/plan/2026-11-12/2/1': { status: 409, json: { error: { code: 'leftover_past_use_by', message: 'x' } } } })
    const { result, spy } = setup()
    let ok = true
    await act(async () => { ok = await result.current(key, chilli) })
    expect(ok).toBe(false)
    expect(await screen.findByText('Chilli is past its Use-by, so it cannot be frozen.')).toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
  })
})
