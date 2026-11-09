import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settingsApi } from '../../settings/api'
import { settingsKeys } from '../../settings/hooks/queryKeys'
import { useCurrency } from './useCurrency'

const settings = { currency: 'EUR' } as Awaited<ReturnType<typeof settingsApi.getSettings>>

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, ...renderHook(() => useCurrency(), { wrapper }) }
}

describe('useCurrency', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is USD until the settings load', () => {
    vi.spyOn(settingsApi, 'getSettings').mockReturnValue(new Promise(() => {}))
    expect(setup().result.current).toBe('USD')
  })

  it("reads the Household's Currency through T1's settingsApi, cached under settingsKeys.settings", async () => {
    const get = vi.spyOn(settingsApi, 'getSettings').mockResolvedValue(settings)
    const { result, client } = setup()
    await waitFor(() => expect(result.current).toBe('EUR'))
    expect(get).toHaveBeenCalled()
    expect(client.getQueryData(settingsKeys.settings)).toEqual(settings)
  })

  it('follows settings saved elsewhere (shared cache entry)', async () => {
    vi.spyOn(settingsApi, 'getSettings').mockResolvedValue(settings)
    const { result, client } = setup()
    await waitFor(() => expect(result.current).toBe('EUR'))
    client.setQueryData(settingsKeys.settings, { ...settings, currency: 'JPY' })
    await waitFor(() => expect(result.current).toBe('JPY'))
  })

  it('stays USD when the settings fail to load', async () => {
    vi.spyOn(settingsApi, 'getSettings').mockRejectedValue(new Error('boom'))
    const { result } = setup()
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current).toBe('USD')
  })
})
