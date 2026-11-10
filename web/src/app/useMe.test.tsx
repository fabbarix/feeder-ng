import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ME_CACHE_KEY } from './meCache'
import { useMe } from './useMe'

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => vi.unstubAllGlobals())

describe('useMe', () => {
  it('returns the signed-in User from GET /api/me', async () => {
    const me = { id: 1, email: 'a@example.test', displayName: 'A', isAdmin: true }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(me), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.data).toEqual(me)
    expect(fetch.mock.calls[0]![0]).toBe('/api/me')
  })

  it('resolves to null (signed out) on 401 instead of erroring', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'x' } }), { status: 401 })),
    )
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.isError).toBe(false)
  })

  it('surfaces other failures as errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

// R10: offline cold reload. The last successful /api/me (the User's own profile) is kept in localStorage and used when
// the network is down; a 401 still means signed out and clears it.
describe('useMe offline (R10)', () => {
  const me = { id: 1, email: 'a@example.test', displayName: 'A', isAdmin: true }
  const networkDown = () => vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

  beforeEach(() => localStorage.clear())

  it('remembers the User after a successful GET /api/me', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(me), { status: 200 })))
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(me))
    expect(JSON.parse(localStorage.getItem(ME_CACHE_KEY)!)).toEqual(me)
  })

  it('answers with the remembered User when the network is unreachable', async () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me))
    vi.stubGlobal('fetch', networkDown())
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.data).toEqual(me)
    expect(result.current.isError).toBe(false)
  })

  it('does not wait for a connection: it fetches even when navigator.onLine is false', async () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const fetch = networkDown()
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(me))
    expect(fetch).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('is an error (not signed out) when the network is down and nothing is remembered', async () => {
    vi.stubGlobal('fetch', networkDown())
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('a 500 is never papered over by the remembered User', async () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('a 401 is signed out and forgets the remembered User', async () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'x' } }), { status: 401 })))
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.data).toBeNull()
    expect(localStorage.getItem(ME_CACHE_KEY)).toBeNull()
  })

  it('ignores a corrupt or incomplete remembered value', async () => {
    localStorage.setItem(ME_CACHE_KEY, '{"id":"x"')
    vi.stubGlobal('fetch', networkDown())
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
