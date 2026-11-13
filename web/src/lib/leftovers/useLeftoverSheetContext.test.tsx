// What the Leftover sheets need besides the Leftover: the Storage Places, the Frozen Use-by of the Recipe and the Household,
// and the Recipe's Use-by days. Read straight from the API (no feature import), only while a sheet is open.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../features/settings/test-utils'
import { places } from './fixtures'
import { useLeftoverSheetContext } from './useLeftoverSheetContext'

afterEach(() => vi.unstubAllGlobals())

const wrap = (client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) =>
  ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

describe('useLeftoverSheetContext', () => {
  it('reads the places, the Household and the Recipe', async () => {
    mockApi({
      'GET /api/storage-places': places,
      'GET /api/household/settings': { frozenUseByDays: 60, defaultLeftoverUseByDays: 4 },
      'GET /api/recipes/10': { id: 10, frozenUseByDays: 30, leftoverUseByDays: 2 },
    })
    const { result } = renderHook(() => useLeftoverSheetContext(10), { wrapper: wrap() })
    await waitFor(() => expect(result.current.storagePlaces).toEqual(places))
    await waitFor(() => expect(result.current.recipeFrozenUseBy).toBe(30))
    expect(result.current.householdFrozenUseBy).toBe(60)
    expect(result.current.recipeUseByDays).toBe(2)
  })

  it('falls back to the Household: no Recipe Frozen Use-by is null, its Use-by days are the Household default', async () => {
    mockApi({
      'GET /api/storage-places': places,
      'GET /api/household/settings': { frozenUseByDays: 90, defaultLeftoverUseByDays: 4 },
      'GET /api/recipes/10': { id: 10, frozenUseByDays: null, leftoverUseByDays: null },
    })
    const { result } = renderHook(() => useLeftoverSheetContext(10), { wrapper: wrap() })
    await waitFor(() => expect(result.current.recipeUseByDays).toBe(4))
    expect(result.current.recipeFrozenUseBy).toBeNull()
    expect(result.current.householdFrozenUseBy).toBe(90)
  })

  it('uses 90 and 3 days while the Household or Recipe cannot be read, so a sheet still opens', async () => {
    mockApi({ 'GET /api/storage-places': places })
    const { result } = renderHook(() => useLeftoverSheetContext(10), { wrapper: wrap() })
    await waitFor(() => expect(result.current.storagePlaces).toEqual(places))
    expect(result.current.householdFrozenUseBy).toBe(90)
    expect(result.current.recipeUseByDays).toBe(3)
    expect(result.current.recipeFrozenUseBy).toBeNull()
  })

  it('reads nothing without a Recipe (no sheet open)', async () => {
    const api = mockApi({})
    const { result } = renderHook(() => useLeftoverSheetContext(null), { wrapper: wrap() })
    expect(result.current.storagePlaces).toEqual([])
    expect(api.calls).toEqual([])
  })

  it('shares the Storage Places with the Pantry: the cache key is [stock, places]', async () => {
    mockApi({ 'GET /api/storage-places': places, 'GET /api/household/settings': {}, 'GET /api/recipes/10': {} })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useLeftoverSheetContext(10), { wrapper: wrap(client) })
    await waitFor(() => expect(result.current.storagePlaces).toEqual(places))
    expect(client.getQueryData(['stock', 'places'])).toEqual(places)
  })
})
