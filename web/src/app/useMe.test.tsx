import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
