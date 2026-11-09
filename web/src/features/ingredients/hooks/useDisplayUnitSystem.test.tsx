import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Preferences } from '../../settings/types'

const prefs = vi.hoisted(() => ({ value: { units: 'metric' } as Partial<Preferences> }))
vi.mock('../../settings/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: prefs.value }),
}))

import { useDisplayUnitSystem } from './useDisplayUnitSystem'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

describe('useDisplayUnitSystem', () => {
  it('follows the signed-in User\'s metric/imperial preference', () => {
    prefs.value = { units: 'imperial' }
    const { result } = renderHook(() => useDisplayUnitSystem(), { wrapper })
    expect(result.current).toBe('imperial')
  })
  it('is metric when the User prefers metric', () => {
    prefs.value = { units: 'metric' }
    const { result } = renderHook(() => useDisplayUnitSystem(), { wrapper })
    expect(result.current).toBe('metric')
  })
})
