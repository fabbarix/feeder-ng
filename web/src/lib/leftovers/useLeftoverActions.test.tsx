import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../features/settings/test-utils'
import { ToastProvider } from '../../ui'
import { friLunch, leftover, TODAY } from './fixtures'
import { useLeftoverActions, useLeftovers, useReplanPreview } from './useLeftoverActions'

afterEach(() => vi.unstubAllGlobals())

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
const chilli = { id: 1, recipeName: 'Chilli' }

describe('useLeftovers', () => {
  it('loads GET /api/plan/leftovers under the plan key', async () => {
    mockApi({ 'GET /api/plan/leftovers': { leftovers: [leftover()] } })
    const client = newClient()
    const { result } = renderHook(() => useLeftovers(), { wrapper: wrapperWith(client) })
    expect(result.current.isPending).toBe(true)
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.leftovers).toEqual([leftover()])
    expect(client.getQueryData(['plan', 'leftovers'])).toBeDefined()
  })
  it('is in error when the list cannot be loaded', async () => {
    mockApi({ 'GET /api/plan/leftovers': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const { result } = renderHook(() => useLeftovers(), { wrapper: wrapperWith(newClient()) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.leftovers).toEqual([])
  })
})

describe('useLeftoverActions', () => {
  it('Had it POSTs the portions, toasts and refreshes the list and the plan', async () => {
    let list = [leftover({ portions: 3 })]
    const api = mockApi({
      'GET /api/plan/leftovers': () => ({ leftovers: list }),
      'POST /api/plan/leftovers/1/had-it': () => {
        list = [leftover({ portions: 1 })]
        return { leftover: list[0], replanned: [] }
      },
    })
    const client = newClient()
    const wrapper = wrapperWith(client)
    const both = renderHook(() => ({ s: useLeftovers(), a: useLeftoverActions({ today: TODAY }) }), { wrapper })
    await waitFor(() => expect(both.result.current.s.leftovers[0]?.portions).toBe(3))
    let ok = false
    await act(async () => {
      ok = await both.result.current.a.run(chilli, { kind: 'had-it', portions: 2 })
    })
    expect(ok).toBe(true)
    expect(api.callsTo('POST', '/api/plan/leftovers/1/had-it')[0]!.body).toEqual({ portions: 2 })
    expect(await screen.findByText('Noted: 2 portions of Chilli. 1 left.')).toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).toBeNull()
    await waitFor(() => expect(both.result.current.s.leftovers[0]?.portions).toBe(1))
  })

  it('Had it with nothing left says None left', async () => {
    mockApi({ 'POST /api/plan/leftovers/1/had-it': { leftover: leftover({ portions: 0 }), replanned: [] } })
    const { result } = renderHook(() => useLeftoverActions({ today: TODAY }), { wrapper: wrapperWith(newClient()) })
    await act(async () => {
      await result.current.run(chilli, { kind: 'had-it', portions: 3 })
    })
    expect(await screen.findByText('Noted: 3 portions of Chilli. None left.')).toBeInTheDocument()
  })

  const invalidated = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)

  it('Had it refreshes the plan and the Pantry (stock) but not the streak or the Board', async () => {
    mockApi({ 'POST /api/plan/leftovers/1/had-it': { leftover: leftover({ portions: 1 }), replanned: [] } })
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useLeftoverActions({ today: TODAY }), { wrapper: wrapperWith(client) })
    await act(async () => {
      await result.current.run(chilli, { kind: 'had-it', portions: 2 })
    })
    expect(invalidated(spy)).toEqual(expect.arrayContaining([['plan'], ['stock']]))
    expect(invalidated(spy)).not.toContainEqual(['today', 'streak'])
    expect(invalidated(spy)).not.toContainEqual(['board'])
  })

  it('Threw it out also refreshes the streak and the Board', async () => {
    mockApi({ 'POST /api/plan/leftovers/1/threw-out': { leftover: leftover({ portions: 0 }), replanned: [] } })
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useLeftoverActions({ today: TODAY }), { wrapper: wrapperWith(client) })
    await act(async () => {
      await result.current.run(chilli, { kind: 'threw-out', portions: 3 })
    })
    expect(invalidated(spy)).toEqual(expect.arrayContaining([['plan'], ['stock'], ['today', 'streak'], ['board']]))
    expect(await screen.findByText('Threw out 3 portions of Chilli.')).toBeInTheDocument()
  })

  it('the Threw it out answer also refreshes the streak and the Board; the other answers do not', async () => {
    mockApi({ 'POST /api/plan/leftovers/1/answer': { status: 204 } })
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useLeftoverActions({ today: TODAY }), { wrapper: wrapperWith(client) })
    await act(async () => {
      await result.current.answer(chilli, 'had_it')
    })
    expect(invalidated(spy)).not.toContainEqual(['today', 'streak'])
    spy.mockClear()
    await act(async () => {
      await result.current.answer(chilli, 'threw_out')
    })
    expect(invalidated(spy)).toEqual(expect.arrayContaining([['plan'], ['stock'], ['today', 'streak'], ['board']]))
  })

  it('Freeze it POSTs the Storage Place and portions and toasts the Use-by', async () => {
    const api = mockApi({
      'POST /api/plan/leftovers/1/freeze': {
        frozen: leftover({ id: 9, frozen: true, storagePlaceId: 2, storagePlaceName: 'Garage Freezer', useBy: '2027-02-10' }),
        left: null,
        replanned: [],
      },
    })
    const { result } = renderHook(() => useLeftoverActions({ today: TODAY }), { wrapper: wrapperWith(newClient()) })
    await act(async () => {
      await result.current.run(chilli, { kind: 'freeze', storagePlaceId: 2, portions: 3 })
    })
    expect(api.calls[0]!.body).toEqual({ storagePlaceId: 2, portions: 3 })
    expect(await screen.findByText('Chilli is in Garage Freezer. Use by 10 Feb.')).toBeInTheDocument()
  })

  it('Take out POSTs the Storage Place (null = Not sorted)', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/take-out': leftover({ useBy: '2026-11-15' }) })
    const { result } = renderHook(() => useLeftoverActions({ today: TODAY }), { wrapper: wrapperWith(newClient()) })
    await act(async () => {
      await result.current.run(chilli, { kind: 'take-out', storagePlaceId: null })
    })
    expect(api.calls[0]!.body).toEqual({ storagePlaceId: null })
    expect(await screen.findByText('Chilli is out of the freezer. Use by Sun.')).toBeInTheDocument()
  })

  it('answer POSTs the answer and toasts', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/answer': { status: 204 } })
    const { result } = renderHook(() => useLeftoverActions({ today: TODAY }), { wrapper: wrapperWith(newClient()) })
    let ok = false
    await act(async () => {
      ok = await result.current.answer(chilli, 'wasnt_there')
    })
    expect(ok).toBe(true)
    expect(api.calls[0]!.body).toEqual({ answer: 'wasnt_there' })
    expect(await screen.findByText("Chilli removed: it wasn't there.")).toBeInTheDocument()
  })

  it('a refused action toasts the error, resolves false and refreshes nothing', async () => {
    mockApi({ 'POST /api/plan/leftovers/1/freeze': { status: 409, json: { error: { code: 'leftover_past_use_by', message: 'x' } } } })
    const client = newClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useLeftoverActions({ today: TODAY }), { wrapper: wrapperWith(client) })
    let ok = true
    await act(async () => {
      ok = await result.current.run(chilli, { kind: 'freeze', storagePlaceId: 2, portions: 3 })
    })
    expect(ok).toBe(false)
    expect(await screen.findByText('Chilli is past its Use-by, so it cannot be frozen.')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('busy is true while a call is in flight', async () => {
    let release: () => void = () => {}
    mockApi({ 'POST /api/plan/leftovers/1/had-it': () => new Promise((r) => { release = () => r({ leftover: leftover(), replanned: [] }) }) })
    const { result } = renderHook(() => useLeftoverActions({ today: TODAY }), { wrapper: wrapperWith(newClient()) })
    expect(result.current.busy).toBe(false)
    let pending: Promise<boolean> = Promise.resolve(false)
    act(() => {
      pending = result.current.run(chilli, { kind: 'had-it', portions: 1 })
    })
    await waitFor(() => expect(result.current.busy).toBe(true))
    await act(async () => {
      release()
      await pending
    })
    expect(result.current.busy).toBe(false)
  })
})

describe('useReplanPreview (the server dry run)', () => {
  it('asks the dry run for the draft request and returns the Planned Meals that would lose portions', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/had-it?dryRun=1': { replanned: [friLunch] } })
    const { result } = renderHook(() => useReplanPreview(1, { kind: 'had-it', portions: 2 }), { wrapper: wrapperWith(newClient()) })
    expect(result.current).toEqual([])
    await waitFor(() => expect(result.current).toEqual([friLunch]))
    expect(api.calls[0]!.body).toEqual({ portions: 2 })
  })
  it('asks again when the draft changes', async () => {
    const api = mockApi({
      'POST /api/plan/leftovers/1/threw-out?dryRun=1': (c: { body?: { portions?: number } }) => ({ replanned: c.body?.portions === 3 ? [friLunch] : [] }),
    })
    const { result, rerender } = renderHook(({ p }) => useReplanPreview(1, { kind: 'threw-out', portions: p }), {
      wrapper: wrapperWith(newClient()),
      initialProps: { p: 1 },
    })
    await waitFor(() => expect(api.calls).toHaveLength(1))
    rerender({ p: 3 })
    await waitFor(() => expect(result.current).toEqual([friLunch]))
    expect(api.calls).toHaveLength(2)
  })
  it('does not call the server without a request or for Take out', async () => {
    const api = mockApi({})
    renderHook(() => useReplanPreview(1, null), { wrapper: wrapperWith(newClient()) })
    renderHook(() => useReplanPreview(1, { kind: 'take-out', storagePlaceId: null }), { wrapper: wrapperWith(newClient()) })
    await act(async () => {})
    expect(api.calls).toEqual([])
  })
})
