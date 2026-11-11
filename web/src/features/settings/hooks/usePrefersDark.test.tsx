import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePrefersDark } from './usePrefersDark'

afterEach(() => vi.unstubAllGlobals())

describe('usePrefersDark', () => {
  it('is false without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => usePrefersDark()).result.current).toBe(false)
  })

  it('follows a change of the system scheme', () => {
    let matches = false
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', (q: string) => ({
      get matches() { return matches },
      media: q,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }))
    const { result } = renderHook(() => usePrefersDark())
    expect(result.current).toBe(false)
    act(() => { matches = true; listeners.forEach((l) => l()) })
    expect(result.current).toBe(true)
  })
})
