// WP-E/G: GET /api/recipe-assistant/status + the signed-in User's role -> ReadAvailability (ra-e-import.md section 5.3).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'

const api = vi.hoisted(() => ({ assistantStatus: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))
const me = vi.hoisted(() => ({ data: { id: 1, email: 'a@x.test', displayName: 'A', isAdmin: false } as { id: number; email: string; displayName: string; isAdmin: boolean } | null | undefined }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: me.data }) }))

import { useReadAvailability } from './useReadAvailability'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useReadAvailability(), { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  me.data = { id: 1, email: 'a@x.test', displayName: 'A', isAdmin: false }
  api.assistantStatus.mockResolvedValue({ available: true, model: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' }, photos: true, limit: { remaining: 12, resetsInSeconds: 900 } })
})

describe('useReadAvailability', () => {
  it('is loading until the status arrives, then usable', async () => {
    const { result } = setup()
    expect(result.current).toMatchObject({ loading: true, enabled: false })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ enabled: true, photos: true, modelName: 'Claude Haiku 5.5', isAdmin: false })
    expect(api.assistantStatus).toHaveBeenCalledTimes(1)
  })
  it('knows an Admin (settings link when unavailable)', async () => {
    me.data = { id: 2, email: 'b@x.test', displayName: 'B', isAdmin: true }
    api.assistantStatus.mockResolvedValue({ available: false, reason: 'off', photos: false })
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ enabled: false, isAdmin: true, settingsLink: true, message: 'The Recipe Assistant is off. Turn it on in Settings.' })
  })
  it('a User is told to ask an Admin', async () => {
    api.assistantStatus.mockResolvedValue({ available: false, reason: 'no_key', photos: false })
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ enabled: false, settingsLink: false, message: 'The Recipe Assistant needs an API key. Ask an Admin.' })
  })
  it('a failed status call is "Could not check the Recipe Assistant", and retry() asks again', async () => {
    api.assistantStatus.mockRejectedValueOnce(new ApiError(0, 'network', 'down'))
    const { result } = setup()
    await waitFor(() => expect(result.current.message).toBe('Could not check the Recipe Assistant. Try again.'))
    expect(result.current.statusFailed).toBe(true)
    expect(result.current.enabled).toBe(false)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.enabled).toBe(true))
    expect(api.assistantStatus).toHaveBeenCalledTimes(2)
  })
  it('the limit of a non-Admin disables reading', async () => {
    api.assistantStatus.mockResolvedValue({ available: true, photos: true, limit: { remaining: 0, resetsInSeconds: 600 } })
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ enabled: false, limitMessage: 'Your Household has read 30 recipes in the last hour. Try again in 10 min.' })
  })
})
